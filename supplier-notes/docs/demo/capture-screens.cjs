const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');

const root = path.resolve(__dirname, '../..');
const exe = path.join(root, 'release', 'win-unpacked', 'HiveMind.exe');
const output = path.join(__dirname, 'hivemind-tour', 'assets');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hivemind-demo-'));
const port = 25000 + Math.floor(Math.random() * 20000);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child;
let socket;
let id = 0;

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    const onMessage = (raw) => {
      const response = JSON.parse(raw);
      if (response.id !== requestId) return;
      socket.off('message', onMessage);
      response.error ? reject(new Error(response.error.message)) : resolve(response.result);
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function capture(name) {
  await pause(700);
  const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`Captured ${name}.png`);
}

async function clickButton(label) {
  const found = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length && b.textContent.trim().startsWith(${JSON.stringify(label)})); if (!button) return false; button.click(); return true; })()`);
  if (!found) throw new Error(`Button not found: ${label}`);
}

async function main() {
  if (!fs.existsSync(exe)) throw new Error('Run npm run electron:build first');
  fs.mkdirSync(output, { recursive: true });
  child = spawn(exe, [`--remote-debugging-port=${port}`, '--force-device-scale-factor=1'], {
    env: { ...process.env, HIVEMIND_TEST_USER_DATA: path.join(profile, 'userData') },
    stdio: 'ignore', windowsHide: true,
  });

  let target;
  for (let attempt = 0; attempt < 60; attempt++) {
    await pause(500);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = targets.find((item) => item.type === 'page' && item.url.startsWith('file:'));
      if (target) break;
    } catch { /* wait for Electron */ }
  }
  if (!target) throw new Error('Electron DevTools did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  await call('Page.enable');

  const { createDemoState } = await import('./fixture.mjs');
  const state = createDemoState();
  await evaluate(`window.electronStore.write(${JSON.stringify(JSON.stringify({ version: 11, state }))})`);
  await evaluate('location.reload()');
  for (let attempt = 0; attempt < 30; attempt++) {
    await pause(300);
    if ((await evaluate('document.body.innerText')).includes('Pilot run planning')) break;
  }
  await capture('notes');
  await clickButton('Overview');
  await capture('overview');
  await clickButton('Follow-up');
  await capture('follow-up');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  socket?.close();
  if (child && child.exitCode === null) child.kill();
  await pause(500);
  if (profile.startsWith(path.join(os.tmpdir(), 'hivemind-demo-'))) fs.rmSync(profile, { recursive: true, force: true });
});
