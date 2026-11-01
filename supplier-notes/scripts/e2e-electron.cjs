// End-to-end checks against the real Electron app (build the renderer first: `npm run build`).
// Uses an isolated, temporary profile — never the user's data. On Linux CI run under Xvfb:
//   xvfb-run -a node scripts/e2e-electron.cjs
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');

const root = path.resolve(__dirname, '..');
const electron = require('electron');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hivemind-e2e-'));
const dataFile = path.join(profile, 'Combobulator-data.json');
const children = new Set();

function launch() {
  const port = 20000 + Math.floor(Math.random() * 30000);
  const args = ['.', `--remote-debugging-port=${port}`];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const child = spawn(electron, args, { cwd: root, env: { ...process.env, HIVEMIND_TEST_USER_DATA: profile }, stdio: 'ignore' });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return { child, port };
}

async function pageTarget(port) {
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const target = targets.find((item) => item.type === 'page' && item.url.endsWith('dist/index.html'));
      if (target) return target;
    } catch { /* not listening yet */ }
  }
  throw new Error('App window did not appear');
}

async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let id = 0;
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const onMessage = (data) => {
      const message = JSON.parse(data);
      if (message.id !== requestId) return;
      socket.off('message', onMessage);
      if (message.error) return reject(new Error(message.error.message));
      if (message.result.exceptionDetails) return reject(new Error(message.result.exceptionDetails.exception?.description || 'Evaluation failed'));
      resolve(message.result.result.value);
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await evaluate(expression).catch(() => false)) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  return { socket, evaluate, waitFor };
}

const exited = (child, ms) => new Promise((resolve) => {
  if (child.exitCode !== null) return resolve(true);
  const timer = setTimeout(() => resolve(false), ms);
  child.once('exit', () => { clearTimeout(timer); resolve(true); });
});

async function main() {
  const results = [];
  const check = async (name, fn) => { await fn(); results.push(name); console.log(`ok - ${name}`); };

  // 1. First launch: create a project through the UI and close immediately.
  const first = launch();
  const page = await connect(await pageTarget(first.port));
  await page.waitFor(`document.body && document.body.innerText.includes('Welcome to HiveMind')`, 'welcome screen');

  await check('renderer cannot navigate the app window to a local file', async () => {
    await page.evaluate(`location.href = 'file://' + ${JSON.stringify(path.join(profile, 'evil.html').replace(/\\/g, '/'))}; true`);
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.match(await page.evaluate('location.href'), /dist\/index\.html/);
    assert.equal(await page.evaluate(`window.open('https://example.com') === null`), true);
  });

  await check('IPC refuses to open non-web links and files outside the attachments folder', async () => {
    assert.equal(await page.evaluate(`window.electronOpenExternal.open('file:///etc/passwd')`), false);
    assert.match(await page.evaluate(`window.electronAttachments.open(${JSON.stringify(process.execPath)})`), /not stored/);
  });

  await check('pasted images are saved over IPC and load through app-image: under the CSP', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const result = await page.evaluate(`(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective));
      const bytes = Uint8Array.from(atob('${png}'), (c) => c.charCodeAt(0));
      const name = await window.electronImages.save(bytes.buffer, 'png');
      const img = new Image();
      const loaded = await new Promise((resolve) => { img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = 'app-image://' + name; });
      return { name, loaded, width: img.naturalWidth, violations };
    })()`);
    assert.match(result.name, /^img-.+\.png$/);
    assert.equal(result.loaded, true);
    assert.equal(result.width, 1);
    assert.deepEqual(result.violations, []);
  });

  await check('a second launch hands over to the running window instead of opening the data file again', async () => {
    const second = launch();
    assert.equal(await exited(second.child, 15000), true, 'second instance should exit');
    assert.equal(first.child.exitCode, null, 'first instance keeps running');
  });

  await check('edits made right before closing the window are saved', async () => {
    await page.evaluate(`(() => {
      const input = document.getElementById('first-project');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'E2E Project');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      window.close();
      return true;
    })()`).catch(() => { /* the page may go away before replying */ });
    assert.equal(await exited(first.child, 15000), true, 'app should quit after its window closes');
    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.deepEqual(saved.state.projects.map((project) => project.name), ['E2E Project']);
    const leftovers = fs.readdirSync(profile).filter((name) => name.endsWith('.tmp') || name.endsWith('.lock'));
    assert.deepEqual(leftovers, [], 'no temp or lock files left behind');
  });

  // 2. Relaunch: data loads and the app opens on the project.
  const relaunch = launch();
  const reopened = await connect(await pageTarget(relaunch.port));
  await check('data written on close is loaded on the next start', async () => {
    await reopened.waitFor(`document.body && document.body.innerText.includes('E2E Project')`, 'project after relaunch');
    const status = await reopened.evaluate('window.electronStore.status()');
    assert.equal(status.error, null);
  });
  reopened.socket.close();
  relaunch.child.kill();
  await exited(relaunch.child, 5000);
  console.log(`\n${results.length} Electron checks passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const child of children) child.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  fs.rmSync(profile, { recursive: true, force: true });
});
