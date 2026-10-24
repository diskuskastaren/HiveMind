const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');
const PE = require('pe-library');
const ResEdit = require('resedit');

const root = path.resolve(__dirname, '..');
const executable = path.join(root, 'release', 'win-unpacked', 'Combobulator.exe');
const port = 20000 + Math.floor(Math.random() * 30000);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'combobulator-smoke-'));
const environment = { ...process.env, HIVEMIND_TEST_USER_DATA: path.join(profile, 'userData') };
let child;

async function evaluate(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  try {
    const response = new Promise((resolve, reject) => {
      socket.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.id === 1) message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      });
      socket.once('error', reject);
    });
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression, awaitPromise: true, returnByValue: true,
    } }));
    const result = await response;
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  } finally { socket.close(); }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Windows smoke test requires Windows');
  if (!fs.existsSync(executable)) throw new Error('Build the Windows app first');

  const exe = PE.NtExecutable.from(fs.readFileSync(executable));
  const entries = PE.NtExecutableResource.from(exe).entries;
  const icons = ResEdit.Resource.IconGroupEntry.fromEntries(entries);
  if (!icons.some((icon) => icon.id === 1 && icon.icons.length >= 2)) throw new Error('Packaged app icon is missing');

  child = spawn(executable, [`--remote-debugging-port=${port}`], {
    env: environment, stdio: 'ignore', windowsHide: true,
  });
  let lastObservation = 'No DevTools response';
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Electron exited with code ${child.exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      lastObservation = JSON.stringify(targets.map((item) => ({ type: item.type, url: item.url })));
      const target = targets.find((item) => item.type === 'page' && item.url.startsWith('file:'));
      if (!target) continue;
      const state = await evaluate(target, `Promise.all([window.electronStore.status(), window.electronStore.getPath()]).then(([status, dataPath]) => ({ title: document.title, body: document.body.innerText.slice(0, 1000), status, dataPath }))`);
      lastObservation = JSON.stringify(state);
      if (!state.dataPath.startsWith(profile)) throw new Error(`Unexpected data path: ${state.dataPath}`);
      if (!state.body.includes('Welcome to Combobulator') && !state.body.includes('Today / My Work')) continue;
      if (state.status.error) throw new Error(`Storage error: ${state.status.error}`);
      const persisted = await evaluate(target, `window.electronStore.write(JSON.stringify({version:11,state:{suppliers:[],notes:[],tasks:[],decisions:[],projects:[],followUps:[],settings:{}}})).then(() => window.electronStore.read()).then(JSON.parse).then(data => data.version === 11 && Array.isArray(data.state.projects))`);
      if (!persisted) throw new Error('Electron IPC persistence failed');
      console.log(JSON.stringify({ title: state.title, iconSizes: icons[0].icons.length,
        rendered: true, persisted, isolatedDataPath: state.dataPath }, null, 2));
      return;
    } catch (error) {
      lastObservation = error.message;
      if (/^(Storage error:|Unexpected data path:|Electron IPC persistence failed)/.test(error.message)) throw error;
    }
  }
  throw new Error(`Electron window did not render in time: ${lastObservation}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && child.exitCode === null) child.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (profile.startsWith(path.join(os.tmpdir(), 'combobulator-smoke-'))) {
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
