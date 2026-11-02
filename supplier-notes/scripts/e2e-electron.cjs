// End-to-end checks against the real Electron app (build the renderer first: `npm run build`).
// Uses an isolated, temporary profile — never the user's data. On Linux CI run under Xvfb:
//   xvfb-run -a node scripts/e2e-electron.cjs
// (on Windows: node scripts/e2e-electron.cjs). No AI provider is contacted.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');

const root = path.resolve(__dirname, '..');
// ELECTRON_PATH lets the checks run against another Electron build (e.g. before upgrading).
const electron = process.env.ELECTRON_PATH || require('electron');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hivemind-e2e-'));
const dataFile = path.join(profile, 'Combobulator-data.json');
const keyFile = path.join(profile, 'api-keys.bin');
// A made-up key: it is only typed into Settings and saved, never tested against OpenAI.
const fakeApiKey = 'sk-e2e-not-a-real-key-0123456789';
const children = new Set();
let stderr = '';

function launch() {
  const port = 20000 + Math.floor(Math.random() * 30000);
  const args = ['.', `--remote-debugging-port=${port}`];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const child = spawn(electron, args, { cwd: root, env: { ...process.env, HIVEMIND_TEST_USER_DATA: profile }, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
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

// Opens Settings → AI & Summarization and returns once the OpenAI key field is shown.
async function openAiSettings(page) {
  await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true })); true`);
  await page.waitFor(`[...document.querySelectorAll('nav[aria-label="Settings sections"] button')].some((b) => b.textContent.includes('AI & Summarization'))`, 'settings dialog');
  await page.evaluate(`[...document.querySelectorAll('nav[aria-label="Settings sections"] button')].find((b) => b.textContent.includes('AI & Summarization')).click(); true`);
  await page.waitFor(`!!document.getElementById('openai-key')`, 'OpenAI key field');
}

const exited = (child, ms) => new Promise((resolve) => {
  if (child.exitCode !== null) return resolve(true);
  const timer = setTimeout(() => resolve(false), ms);
  child.once('exit', () => { clearTimeout(timer); resolve(true); });
});

async function main() {
  const results = [];
  const check = async (name, fn) => { await fn(); results.push(name); console.log(`ok - ${name}`); };

  // 1. First launch: create a project through the UI and close immediately. The profile starts with
  // a key file that cannot be decrypted (as when data is copied from another computer).
  const unreadableKeyFile = Buffer.concat([Buffer.from('v10'), Buffer.alloc(48, 7)]);
  fs.writeFileSync(keyFile, unreadableKeyFile);
  const first = launch();
  const page = await connect(await pageTarget(first.port));
  await page.waitFor(`document.body && document.body.innerText.includes('Welcome to HiveMind')`, 'welcome screen');

  await check('renderer cannot navigate the app window to a local file', async () => {
    await page.evaluate(`location.href = 'file://' + ${JSON.stringify(path.join(profile, 'evil.html').replace(/\\/g, '/'))}; true`);
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.match(await page.evaluate('location.href'), /dist\/index\.html/);
    // A local URL: refused like any other, but never handed to the system browser.
    assert.equal(await page.evaluate(`window.open('file:///etc/hosts') === null`), true);
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

  await check('system-audio capture is permitted (desktop capture stream opens)', async () => {
    const result = await page.evaluate(`(async () => {
      const sources = await window.electronCapture.getSources();
      if (!sources.length) return { error: 'no capture sources' };
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id, maxWidth: 1, maxHeight: 1 } } });
        const kinds = stream.getTracks().map((track) => track.kind);
        stream.getTracks().forEach((track) => track.stop());
        return { kinds };
      } catch (error) { return { error: error.name + ': ' + error.message }; }
    })()`);
    assert.deepEqual(result, { kinds: ['video'] });
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

  await check('a key file that cannot be decrypted is kept, not overwritten by the save', async () => {
    assert.deepEqual(fs.readFileSync(keyFile), unreadableKeyFile);
  });

  // 2. Relaunch: data loads and the app opens on the project.
  const relaunch = launch();
  const reopened = await connect(await pageTarget(relaunch.port));
  await check('data written on close is loaded on the next start', async () => {
    await reopened.waitFor(`document.body && document.body.innerText.includes('E2E Project')`, 'project after relaunch');
    const status = await reopened.evaluate('window.electronStore.status()');
    assert.equal(status.error, null);
  });

  await check('an API key entered in Settings replaces it, stored encrypted and not in the data file', async () => {
    await openAiSettings(reopened);
    await reopened.evaluate(`(() => {
      const input = document.getElementById('openai-key');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      input.focus();
      setter.call(input, ${JSON.stringify(fakeApiKey)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
      return true;
    })()`);
    await reopened.waitFor(`document.body.innerText.includes('API key saved')`, 'saved key status');
    await reopened.evaluate('window.close(); true').catch(() => { /* the page may go away before replying */ });
    assert.equal(await exited(relaunch.child, 15000), true, 'app should quit after its window closes');
    const raw = fs.readFileSync(dataFile, 'utf8');
    assert.equal(raw.includes(fakeApiKey), false, 'key must not be written to the data file');
    assert.equal(JSON.parse(raw).state.settings.openaiApiKey, '');
    const encrypted = fs.readFileSync(keyFile);
    assert.notDeepEqual(encrypted, unreadableKeyFile, 'key file replaced');
    assert.equal(encrypted.includes(Buffer.from(fakeApiKey)), false, 'key file must not contain the plain key');
  });

  // 3. Third launch, with a supplier and an open note added to the saved workspace: the editor works
  // in the desktop app, and the encrypted key is read back.
  const workspace = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const projectId = workspace.state.projects[0].id;
  workspace.state.suppliers = [{ id: 'sup-e2e', name: 'E2E Supplier', color: '#3b82f6', pinned: false, defaultTemplate: null, projectIds: [projectId], createdAt: Date.now() }];
  workspace.state.notes = [{ id: 'note-e2e', projectIds: [projectId], supplierIds: ['sup-e2e'], title: 'E2E Note', attendees: '', createdAt: Date.now(), updatedAt: Date.now(), transcripts: [],
    content: '<h2>Agenda</h2><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Desktop check</p></div></li></ul><p>Hello from E2E</p>' }];
  Object.assign(workspace.state, { activeProjectId: projectId, openTabs: ['sup-e2e'], activeTabId: 'sup-e2e', activeNoteId: 'note-e2e' });
  fs.writeFileSync(dataFile, JSON.stringify(workspace));
  const third = launch();
  const restarted = await connect(await pageTarget(third.port));
  await check('the note editor works in the desktop app; pasted images are saved as app-image files', async () => {
    await restarted.waitFor(`document.querySelector('.ProseMirror')?.innerText.includes('Hello from E2E')`, 'note in the editor');
    assert.equal(await restarted.evaluate(`document.querySelector('.ProseMirror ul[data-type="taskList"] input').checked`), true);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await restarted.evaluate(`(() => {
      const editor = document.querySelector('.ProseMirror');
      editor.focus();
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob('${png}'), (c) => c.charCodeAt(0))], 'shot.png', { type: 'image/png' }));
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
      return true;
    })()`);
    await restarted.waitFor(`[...document.querySelectorAll('.ProseMirror img')].some((img) => img.src.startsWith('app-image://') && img.complete && img.naturalWidth === 1)`, 'pasted image shown');
    const saved = fs.readdirSync(path.join(profile, 'images')).filter((name) => name.endsWith('.png'));
    assert.ok(saved.length >= 2, 'pasted image written to the images folder');
  });
  await check('the stored API key is decrypted and shown after a restart', async () => {
    await restarted.waitFor(`document.body && document.body.innerText.includes('E2E Project')`, 'project after restart');
    await openAiSettings(restarted);
    assert.equal(await restarted.evaluate(`document.getElementById('openai-key').value`), fakeApiKey);
  });
  restarted.socket.close();
  third.child.kill();
  await exited(third.child, 5000);

  await check('Electron printed no deprecation warnings', async () => {
    const warnings = stderr.split('\n').filter((line) => /deprecat/i.test(line));
    assert.deepEqual(warnings, []);
  });
  console.log(`\n${results.length} Electron checks passed`);
}

// After a failure, show what the app itself recorded: its log file and Electron's error output.
function printDiagnostics() {
  const tail = (text, lines) => text.split('\n').filter((line) => line.trim()).slice(-lines).join('\n');
  try {
    const log = fs.readFileSync(path.join(profile, 'logs', 'hivemind.log'), 'utf8');
    console.error(`\n--- app log (last 40 lines) ---\n${tail(log, 40)}`);
  } catch (error) { console.error(`\n--- app log unavailable: ${error.message}`); }
  // Chromium's D-Bus and NODE_OPTIONS notices are expected on CI and only add noise.
  const output = stderr.split('\n').filter((line) => !/dbus|NODE_OPTION/i.test(line)).join('\n');
  console.error(`--- Electron error output (last 40 lines) ---\n${tail(output, 40) || '(none)'}\n`);
}

main().catch((error) => { console.error(error); printDiagnostics(); process.exitCode = 1; }).finally(async () => {
  for (const child of children) child.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  // On Windows a just-killed process can keep its files locked for a moment.
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
  catch (error) { console.warn(`Could not remove the temporary profile ${profile}: ${error.message}`); }
  // Helper processes Electron started (e.g. crashpad, xdg-open) can outlive it and hold the stderr
  // pipe open, which would keep this script running after the checks finished.
  process.exit();
});
