const { app, BrowserWindow, ipcMain, Menu, MenuItem, protocol, net, desktopCapturer, shell, screen, dialog, crashReporter, safeStorage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { StorageService, validateData, atomicWrite, rebaseManagedAttachments } = require('./storage.cjs');
const { createLogger } = require('./logger.cjs');
const { isSafeExternalUrl, isInsideDirectory, isAppUrl, encodeMimeHeader } = require('./security.cjs');
const { WebSocket } = require('ws');
const { autoUpdater } = require('electron-updater');

// Keep the existing profile when the visible product name changes to HiveMind.
// Electron otherwise derives a new userData path from the application name.
const USER_DATA_DIR = process.env.HIVEMIND_TEST_USER_DATA || path.join(app.getPath('appData'), 'supplier-notes');
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
app.setPath('userData', USER_DATA_DIR);

const log = createLogger(path.join(USER_DATA_DIR, 'logs'));
const RELEASES_URL = 'https://github.com/diskuskastaren/HiveMind/releases/latest';
const INDEX_FILE = path.join(__dirname, '..', 'dist', 'index.html');

// Only one process may own the data file. A second launch would trip the
// "changed outside this app" protection and lock saving, so focus the first window instead.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

// Native crash dumps stay on this computer (uploadToServer: false).
crashReporter.start({ uploadToServer: false });

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception in main process', error);
  try {
    dialog.showErrorBox('HiveMind ran into an unexpected problem',
      `${error?.message || error}\n\nDetails were written to ${log.file}`);
  } catch { /* dialog unavailable before ready */ }
});
process.on('unhandledRejection', (reason) => log.error('Unhandled promise rejection in main process', reason));

// --- Configurable data directory ---
// app-config.json lives permanently in the default userData folder and acts as
// a pointer to wherever the user has chosen to store their actual data.
const APP_CONFIG_FILE = path.join(app.getPath('userData'), 'app-config.json');

function loadAppConfig() {
  try {
    if (fs.existsSync(APP_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(APP_CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

async function saveAppConfig(cfg) {
  try {
    await atomicWrite(APP_CONFIG_FILE, JSON.stringify(cfg, null, 2));
    return true;
  } catch (e) {
    log.error('Failed to save app config', { message: e.message });
    return false;
  }
}

function getDataDir() {
  const cfg = loadAppConfig();
  return cfg.customDataDir || app.getPath('userData');
}

let DATA_FILE = path.join(getDataDir(), 'Combobulator-data.json');
let IMAGES_DIR = path.join(getDataDir(), 'images');
const SECRET_FILE = path.join(app.getPath('userData'), 'api-keys.bin');
// API keys are encrypted with the OS key store (DPAPI on Windows) via the asynchronous
// safeStorage API (the synchronous one is deprecated in Electron 45 and removed in 46; the async
// API decrypts data written by the old one). Decrypted keys are cached: every save passes the keys
// along, and decrypting the key file on each keystroke-triggered save is wasted work.
let cachedSecrets = null;
// Set when a key file exists but cannot be decrypted (e.g. the OS key store is unavailable). The
// renderer then has empty keys, and its next save must not replace the stored keys with nothing.
let secretsUnreadable = false;
async function readSecrets() {
  if (cachedSecrets) return { ...cachedSecrets };
  // Retried on the next start; retrying on every save would only repeat the error.
  if (secretsUnreadable || !fs.existsSync(SECRET_FILE)) return {};
  try {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      secretsUnreadable = true;
      log.error('Unable to read API keys: secure storage is unavailable');
      return {};
    }
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(await fs.promises.readFile(SECRET_FILE));
    cachedSecrets = JSON.parse(result);
    // The OS asks for re-encryption when its key changed; keep the stored copy current.
    if (shouldReEncrypt) {
      await atomicWrite(SECRET_FILE, await safeStorage.encryptStringAsync(result))
        .catch((error) => log.warn('Could not re-encrypt API keys', { message: error.message }));
    }
    return { ...cachedSecrets };
  } catch (error) {
    secretsUnreadable = true;
    log.error('Unable to read API keys', { message: error.message });
    return {};
  }
}
async function writeSecrets(keys) {
  if (!keys.openaiApiKey && !keys.groqApiKey && !fs.existsSync(SECRET_FILE)) return;
  const current = await readSecrets();
  if (current.openaiApiKey === keys.openaiApiKey && current.groqApiKey === keys.groqApiKey) return;
  // Keep a key file we could not read rather than overwrite it with empty keys; entering a new key
  // replaces it.
  if (secretsUnreadable && !keys.openaiApiKey && !keys.groqApiKey) return;
  if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('Secure API key storage is unavailable');
  await atomicWrite(SECRET_FILE, await safeStorage.encryptStringAsync(JSON.stringify(keys)));
  cachedSecrets = { openaiApiKey: keys.openaiApiKey, groqApiKey: keys.groqApiKey };
  secretsUnreadable = false;
}
const storage = new StorageService(getDataDir(), { readSecret: readSecrets, writeSecret: writeSecrets });
// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// Register custom protocol for serving local images
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-image', privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);

ipcMain.handle('store:read', () => storage.read());
ipcMain.handle('store:write', (_event, data) => storage.write(data));
ipcMain.handle('store:status', () => storage.status());
ipcMain.handle('store:backups', () => storage.listBackups());
ipcMain.handle('store:backup', () => storage.backup());
ipcMain.handle('store:restore', async (_event, id) => {
  const result = await storage.restore(id);
  storage.closeForRestart();
  log.info('Backup restored; relaunching', { id });
  app.relaunch();
  app.exit(0);
  return result;
});

ipcMain.handle('store:path', () => DATA_FILE);

ipcMain.handle('store:openFolder', () => shell.openPath(path.dirname(DATA_FILE)));

ipcMain.handle('store:getDataDir', () => {
  const cfg = loadAppConfig();
  return { dir: path.dirname(DATA_FILE), isCustom: !!cfg.customDataDir };
});

ipcMain.handle('store:changeDataDir', async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose data folder',
    defaultPath: path.dirname(DATA_FILE),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { changed: false };

  const newDir = result.filePaths[0];
  if (path.resolve(newDir) === path.resolve(path.dirname(DATA_FILE))) return { changed: false };
  const oldDataFile = DATA_FILE;
  const newDataFile = path.join(newDir, 'Combobulator-data.json');
  try {
    await storage.flush();
    if (fs.existsSync(newDataFile)) return { changed: false, error: 'The selected folder already contains data. Choose an empty folder to avoid replacing it.' };
    const migrated = fs.existsSync(oldDataFile)
      ? rebaseManagedAttachments(fs.readFileSync(oldDataFile, 'utf8'), path.dirname(oldDataFile), newDir) : null;
    for (const folder of ['images', 'attachments', 'backups']) {
      const source = path.join(path.dirname(oldDataFile), folder);
      if (fs.existsSync(source)) fs.cpSync(source, path.join(newDir, folder), { recursive: true, force: false });
    }
    if (migrated) await atomicWrite(newDataFile, migrated);
  } catch (e) {
    log.error('Failed to move data folder', { message: e.message });
    return { changed: false, error: 'Could not copy or validate data in the new location.' };
  }

  // Persist the choice
  const cfg = loadAppConfig();
  cfg.customDataDir = newDir;
  if (!await saveAppConfig(cfg)) return { changed: false, error: 'Could not save the new data folder setting.' };
  storage.closeForRestart();
  log.info('Data folder changed; relaunching');

  // Relaunch so all paths are re-resolved from the new location
  app.relaunch();
  app.exit(0);
  return { changed: true };
});

ipcMain.handle('store:resetDataDir', async () => {
  const defaultDir = app.getPath('userData');
  const defaultFile = path.join(defaultDir, 'Combobulator-data.json');
  if (path.resolve(defaultDir) !== path.resolve(path.dirname(DATA_FILE))) {
    try {
      await storage.flush();
      if (fs.existsSync(defaultFile)) {
        validateData(fs.readFileSync(defaultFile, 'utf8'));
        return { changed: false, error: 'The default folder already contains data. Open it and choose which copy to keep before resetting.' };
      }
      const migrated = fs.existsSync(DATA_FILE)
        ? rebaseManagedAttachments(fs.readFileSync(DATA_FILE, 'utf8'), path.dirname(DATA_FILE), defaultDir) : null;
      for (const folder of ['images', 'attachments', 'backups']) {
        const source = path.join(path.dirname(DATA_FILE), folder);
        if (fs.existsSync(source)) fs.cpSync(source, path.join(defaultDir, folder), { recursive: true, force: false });
      }
      if (migrated) await atomicWrite(defaultFile, migrated);
    } catch (error) {
      return { changed: false, error: `Could not copy data to the default folder: ${error.message}` };
    }
  }
  const cfg = loadAppConfig();
  delete cfg.customDataDir;
  if (!await saveAppConfig(cfg)) return { changed: false, error: 'Could not reset the data folder setting.' };
  storage.closeForRestart();
  app.relaunch();
  app.exit(0);
  return { changed: true };
});

ipcMain.handle('updater:check', () => !app.isPackaged
  ? { status: 'unavailable', message: 'Updates are only available in the installed app.' }
  : new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Update check timed out')); }, 30_000);

    const onAvailable    = (info) => { cleanup(); resolve({ status: 'available', version: info.version }); };
    const onNotAvailable = ()     => { cleanup(); resolve({ status: 'up-to-date' }); };
    const onError        = (err)  => { cleanup(); reject(err); };

    const cleanup = () => {
      clearTimeout(timer);
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('error', onError);
    };

    autoUpdater.once('update-available', onAvailable);
    autoUpdater.once('update-not-available', onNotAvailable);
    autoUpdater.once('error', onError);
    autoUpdater.checkForUpdates().catch((err) => { cleanup(); reject(err); });
  })
);
ipcMain.handle('updater:install', async () => {
  await storage.flush();
  if (fs.existsSync(DATA_FILE)) await storage.backup();
  log.info('Installing downloaded update');
  autoUpdater.quitAndInstall();
});
// Fallback when an update cannot be downloaded or installed (e.g. blocked by antivirus).
ipcMain.handle('updater:openReleases', () => shell.openExternal(RELEASES_URL));

// Return screen source IDs so the renderer can capture system audio
ipcMain.handle('desktop:getSources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  } catch (e) {
    log.error('Failed to get desktop sources', { message: e.message });
    return [];
  }
});

// Save an image buffer to the images folder, return the filename
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
ipcMain.handle('image:save', async (_event, buffer, ext) => {
  try {
    const bytes = Buffer.from(buffer);
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Image is empty or larger than 50 MB');
    const safeExt = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? ext : 'png';
    const filename = `img-${Date.now()}-${crypto.randomUUID()}.${safeExt}`;
    await fs.promises.mkdir(IMAGES_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(IMAGES_DIR, filename), bytes);
    return filename;
  } catch (e) {
    log.error('Failed to save image', { message: e.message });
    return null;
  }
});

// Delete an image file from the images folder
ipcMain.handle('image:delete', (_event, filename) => {
  try {
    if (typeof filename !== 'string' || filename !== path.basename(filename)) throw new Error('Invalid image filename');
    const filepath = path.join(IMAGES_DIR, filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (e) {
    log.error('Failed to delete image', { message: e.message });
  }
});

// Show native file picker and return selected file paths
ipcMain.handle('dialog:openFiles', async (_event) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win || BrowserWindow.getAllWindows()[0], {
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled) return [];
  await fs.promises.mkdir(storage.attachmentsDir, { recursive: true });
  const managed = [];
  for (const source of result.filePaths) {
    const destination = path.join(storage.attachmentsDir, `${crypto.randomUUID()}-${path.basename(source)}`);
    await fs.promises.copyFile(source, destination);
    managed.push(destination);
  }
  return managed;
});

// Open a managed attachment with its default application. Only files inside HiveMind's own
// attachments folder are opened, so the renderer cannot launch arbitrary programs.
ipcMain.handle('attachment:open', async (_event, filePath) => {
  if (!isInsideDirectory(filePath, storage.attachmentsDir)) {
    log.warn('Refused to open a file outside the attachments folder');
    return 'This attachment is not stored in HiveMind\u2019s attachments folder, so it was not opened.';
  }
  if (!fs.existsSync(filePath)) return 'The attachment file could not be found. Restore a backup to recover it.';
  return shell.openPath(filePath);
});

// Open web and mail links in the system default app (e.g. mailto: → Outlook).
ipcMain.handle('shell:openExternal', async (_event, url) => {
  if (!isSafeExternalUrl(url)) {
    log.warn('Refused to open a non-web link');
    return false;
  }
  await shell.openExternal(url);
  return true;
});

// Create a new Outlook email with HTML body via a temporary .eml file.
// Opening the file via shell.openExternal uses the default mail client
// (correct Outlook version), and X-Unsent: 1 opens it in compose mode.
ipcMain.handle('mail:openOutlook', async (_event, subject, htmlBody) => {
  try {
    const os = require('os');
    const tmpFile = path.join(os.tmpdir(), `outlook-draft-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.eml`);
    const eml = [
      'MIME-Version: 1.0',
      'X-Unsent: 1',
      `Subject: ${encodeMimeHeader(subject)}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody,
    ].join('\r\n');
    fs.writeFileSync(tmpFile, eml, 'utf-8');
    await shell.openExternal(tmpFile);
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 15000);
    return true;
  } catch (e) {
    log.error('Failed to open Outlook draft', { message: e.message });
    return false;
  }
});

// ── Teams overlay window ───────────────────────────────────────────────────────
let overlayWindow = null;

function showOverlay() {
  // A hidden overlay from earlier in the session is reused (destroying it while Teams renders is unsafe).
  if (overlayWindow && !overlayWindow.isDestroyed()) { overlayWindow.showInactive(); return; }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const overlayWidth = 500;
  const overlayHeight = 190;

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: Math.round((screenWidth - overlayWidth) / 2),
    y: -20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

// Immediately hide the overlay (safe at any time — no DWM teardown triggered).
// Use this while Teams is still actively rendering (meeting in progress).
function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

// Destroy the overlay (only call when Teams is NOT actively rendering —
// i.e. at meeting end or app quit). Destroying a transparent/layered window
// while the NVIDIA DWM compositor is rendering Teams crashes the browser
// process in ntdll/gdi32. Hiding is always safe; destroying is not.
function destroyOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }
}

// Keep closeOverlay as an alias for destroyOverlay for any call sites that
// are already at a safe moment (meeting end / app quit).
function closeOverlay() { destroyOverlay(); }

ipcMain.on('overlay:start-recording', () => {
  const mainWindow = getMainWindow();

  // Hide (not destroy) the overlay. Teams is still actively rendering video, so
  // destroying the transparent/layered HWND here would crash the main process via
  // DWM/NVIDIA (ntdll/gdi32). The actual destroy happens in destroyOverlay() when
  // the Teams meeting ends and Teams has stopped rendering.
  hideOverlay();

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('teams:meeting-joined');
  }
});

ipcMain.on('overlay:dismiss', () => {
  // Hide rather than destroy — Teams is still rendering.
  hideOverlay();
});

// ── Isolated audio-capture window ─────────────────────────────────────────────
// We run getUserMedia({ chromeMediaSource:'desktop' }) inside a separate hidden
// BrowserWindow so that a GPU-process crash (common when Teams is active) only
// kills the capture window, not the main app.

let captureWindow     = null;
let captureMainWindow = null; // main renderer that started the current capture
let captureStartAbort = null; // rejects a pending desktop:startCapture if the window dies

function createCaptureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) return captureWindow;

  captureWindow = new BrowserWindow({
    width:       1,
    height:      1,
    show:        false,
    skipTaskbar: true,
    webPreferences: {
      preload:          path.join(__dirname, 'capture-preload.cjs'),
      nodeIntegration:  false,
      contextIsolation: true,
      // The window is never shown. Without this Chromium throttles its timers and stops
      // producing frames, which froze the system-audio visualizer.
      backgroundThrottling: false,
    },
  });

  captureWindow.loadFile(path.join(__dirname, 'capture.html'));

  // If the GPU process inside the capture window crashes, notify the main renderer
  // but leave the main app running.
  captureWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('Audio capture window stopped', { reason: details.reason, exitCode: details.exitCode });
    captureStartAbort?.(new Error(`Audio capture process stopped unexpectedly (${details.reason}).`));
    if (captureMainWindow && !captureMainWindow.isDestroyed()) {
      captureMainWindow.webContents.send(
        'capture:error',
        `Audio capture process stopped unexpectedly (${details.reason}). ` +
        'Try restarting the recording.',
      );
    }
    captureWindow = null;
  });

  captureWindow.on('closed', () => { captureWindow = null; });

  return captureWindow;
}

// Main renderer → start capture in the hidden window and wait for it to be ready.
ipcMain.handle('desktop:startCapture', async (event, sourceId) => {
  captureMainWindow = BrowserWindow.fromWebContents(event.sender);
  const win = createCaptureWindow();

  // Wait for the capture window's HTML + preload to finish loading.
  if (win.webContents.isLoading()) {
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  }

  // Ask the capture window to start, then wait for success, failure, a crash or a timeout —
  // previously a capture window that never answered left "Start recording" hanging forever.
  return new Promise((resolve, reject) => {
    const finish = (error, mimeType) => {
      clearTimeout(timer);
      ipcMain.removeListener('capture:ready', onReady);
      ipcMain.removeListener('capture:error', onError);
      captureStartAbort = null;
      if (error) reject(error); else resolve(mimeType);
    };
    const onReady = (_e, mimeType) => finish(null, mimeType);
    const onError = (_e, msg) => finish(new Error(msg));
    const timer = setTimeout(() => finish(new Error('Audio capture did not start within 15 seconds. Try again.')), 15_000);
    captureStartAbort = (error) => finish(error);
    ipcMain.once('capture:ready', onReady);
    ipcMain.once('capture:error', onError);
    win.webContents.send('capture:do-start', sourceId);
  });
});

// Main renderer → stop capture; resolves only after all final chunks are delivered.
ipcMain.handle('desktop:stopCapture', async () => {
  if (!captureWindow || captureWindow.isDestroyed()) return;

  return new Promise(resolve => {
    // Safety timeout so stop() never hangs if the capture window crashes mid-drain.
    const timer = setTimeout(() => {
      ipcMain.removeListener('capture:stopped', onStopped);
      resolve();
    }, 5000);

    const onStopped = () => {
      clearTimeout(timer);
      resolve();
    };
    ipcMain.once('capture:stopped', onStopped);
    captureWindow.webContents.send('capture:do-stop');
  });
});

ipcMain.handle('desktop:flushCapture', async () => {
  if (!captureWindow || captureWindow.isDestroyed()) return;

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      ipcMain.removeListener('capture:flushed', onFlushed);
      resolve();
    }, 5000);

    const onFlushed = () => {
      clearTimeout(timer);
      resolve();
    };
    ipcMain.once('capture:flushed', onFlushed);
    captureWindow.webContents.send('capture:do-flush');
  });
});

// Forward audio chunks from the capture window to the main renderer.
ipcMain.on('capture:chunk', (_event, buffer) => {
  if (captureMainWindow && !captureMainWindow.isDestroyed()) {
    captureMainWindow.webContents.send('capture:chunk', buffer);
  }
});

// Forward visualizer frequency levels from the capture window to the main renderer.
ipcMain.on('capture:levels', (_event, data) => {
  if (captureMainWindow && !captureMainWindow.isDestroyed()) {
    captureMainWindow.webContents.send('capture:levels', data);
  }
});

// Forward runtime errors from the capture window to the main renderer.
// (Start-phase errors are handled via ipcMain.once inside desktop:startCapture.)
ipcMain.on('capture:error', (_event, msg) => {
  if (captureMainWindow && !captureMainWindow.isDestroyed()) {
    captureMainWindow.webContents.send('capture:error', msg);
  }
});

// Capture window signals that all audio has been flushed; forward then destroy.
ipcMain.on('capture:stopped', () => {
  if (captureMainWindow && !captureMainWindow.isDestroyed()) {
    captureMainWindow.webContents.send('capture:stopped');
  }
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.close();
  }
});

// ── Teams Local WebSocket API integration ─────────────────────────────────────
const TEAMS_TOKEN_FILE = path.join(app.getPath('userData'), 'teams-token.json');

function loadTeamsToken() {
  try {
    if (fs.existsSync(TEAMS_TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TEAMS_TOKEN_FILE, 'utf-8'));
      return data.token || '';
    }
  } catch {}
  return '';
}

function saveTeamsToken(token) {
  try {
    fs.writeFileSync(TEAMS_TOKEN_FILE, JSON.stringify({ token }), 'utf-8');
  } catch {}
}

let teamsWs = null;
let teamsRetryTimer = null;
let teamsWasInMeeting = false;
let teamsConnected = false;
// Detection only runs after the renderer reports the "Teams meeting detection" setting,
// so turning it off in Settings stops the connection and the overlay immediately.
let teamsEnabled = false;

function connectToTeams() {
  if (!teamsEnabled || teamsWs) return;

  const token = loadTeamsToken();
  const url = `ws://localhost:8124?token=${encodeURIComponent(token)}&protocol-version=2.0.0&manufacturer=HiveMind&device=HiveMind&app=HiveMind&app-version=${encodeURIComponent(app.getVersion())}`;

  try {
    teamsWs = new WebSocket(url);
  } catch {
    teamsWs = null;
    scheduleTeamsReconnect();
    return;
  }

  teamsWs.on('open', () => {
    teamsConnected = true;
    log.info('Connected to Teams local API');
  });

  teamsWs.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.tokenRefresh) {
      saveTeamsToken(msg.tokenRefresh);
    }

    // Before pairing: Teams sends canPair:true without a meetingState object.
    // After pairing: Teams sends the full meetingState with isInMeeting.
    // Both are valid "in meeting" signals.
    const meetingState = msg.meetingUpdate?.meetingState;
    const permissions = msg.meetingUpdate?.meetingPermissions;

    const isInMeeting =
      meetingState?.isInMeeting === true ||
      permissions?.canPair === true;

    if (isInMeeting && !teamsWasInMeeting) {
      teamsWasInMeeting = true;
      showOverlay();
    } else if (!isInMeeting && teamsWasInMeeting) {
      teamsWasInMeeting = false;
      closeOverlay();
    }
  });

  teamsWs.on('close', () => {
    if (teamsConnected) log.info('Teams local API connection closed');
    teamsConnected = false;
    teamsWs = null;
    scheduleTeamsReconnect();
  });

  teamsWs.on('error', () => {
    // 'close' fires after 'error', reconnect handled there
  });
}

function scheduleTeamsReconnect() {
  if (teamsRetryTimer || !teamsEnabled) return;
  teamsRetryTimer = setTimeout(() => {
    teamsRetryTimer = null;
    connectToTeams();
  }, 10000);
}

function disconnectFromTeams() {
  if (teamsRetryTimer) { clearTimeout(teamsRetryTimer); teamsRetryTimer = null; }
  if (teamsWs) { const socket = teamsWs; teamsWs = null; socket.removeAllListeners(); socket.on('error', () => {}); socket.terminate(); }
  teamsConnected = false;
  teamsWasInMeeting = false;
  hideOverlay();
}

ipcMain.on('teams:set-enabled', (_event, enabled) => {
  teamsEnabled = enabled === true;
  if (teamsEnabled) connectToTeams(); else disconnectFromTeams();
});

// ── Main window ───────────────────────────────────────────────────────────────
let mainWindow = null;
function getMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

const APP_URLS = { devServerUrl: process.env.VITE_DEV_SERVER_URL || '', indexFileUrl: pathToFileURL(INDEX_FILE).href };
// The helper windows (Teams overlay, hidden audio capture) may only show their own page.
const HELPER_PAGES = new Set(['overlay.html', 'capture.html'].map((name) => pathToFileURL(path.join(__dirname, name)).href));

// Every window HiveMind creates only ever shows its own bundled pages. Dropping a file or
// following a link must not replace the app (the page would keep the privileged preload API).
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (contents === getMainWindow()?.webContents && isAppUrl(url, APP_URLS)) return;
    if (contents !== getMainWindow()?.webContents && HELPER_PAGES.has(url.split('#')[0])) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) shell.openExternal(url).catch(() => {});
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

/**
 * Ask the renderer to persist anything it has not sent yet. Resolves when it confirms,
 * or after a timeout so a hung renderer can never block closing the app.
 */
function requestRendererFlush(win, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const done = () => {
      clearTimeout(timer);
      ipcMain.removeListener('app:flushed', onFlushed);
      resolve();
    };
    const onFlushed = (event, replyId) => {
      if (event.sender === win.webContents && replyId === id) done();
    };
    const timer = setTimeout(() => {
      log.warn('Renderer did not confirm saving before close');
      done();
    }, timeoutMs);
    ipcMain.on('app:flushed', onFlushed);
    try { win.webContents.send('app:flush', id); } catch { done(); }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'HiveMind',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow = win;

  win.setMenuBarVisibility(false);

  win.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();

    for (const suggestion of params.dictionarySuggestions) {
      menu.append(new MenuItem({
        label: suggestion,
        click: () => win.webContents.replaceMisspelling(suggestion),
      }));
    }

    if (params.misspelledWord) {
      if (menu.items.length > 0) menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: `Add "${params.misspelledWord}" to dictionary`,
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      }));
    }

    if (menu.items.length > 0) menu.popup();
  });

  // Let the renderer save pending edits before the window goes away.
  let closeConfirmed = false;
  win.on('close', (event) => {
    if (closeConfirmed || win.webContents.isCrashed()) return;
    event.preventDefault();
    requestRendererFlush(win).finally(() => {
      closeConfirmed = true;
      if (!win.isDestroyed()) win.close();
    });
  });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  // A crashed renderer leaves a blank window; reload it (bounded, to avoid a crash loop).
  const recentCrashes = [];
  win.webContents.on('render-process-gone', (_e, details) => {
    log.error('Renderer process gone', { reason: details.reason, exitCode: details.exitCode });
    if (details.reason === 'clean-exit') return;
    const now = Date.now();
    while (recentCrashes.length && now - recentCrashes[0] > 60_000) recentCrashes.shift();
    recentCrashes.push(now);
    if (recentCrashes.length <= 3 && !win.isDestroyed()) win.webContents.reload();
    else dialog.showErrorBox('HiveMind stopped responding', `The window crashed repeatedly. Your saved data is safe. Restart HiveMind; details are in ${log.file}`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(INDEX_FILE);
  }

  return win;
}

function sendToMainWindow(channel, payload) {
  const win = getMainWindow();
  if (win) win.webContents.send(channel, payload);
}

app.on('second-instance', () => {
  const win = getMainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  app.setAppUserModelId('com.fractal.supplier-notes');
  log.info('Starting HiveMind', { version: app.getVersion(), packaged: app.isPackaged, platform: process.platform });

  // Grant microphone and media permissions so Web Speech API and getUserMedia work.
  // Since Electron 45, desktop capture (system-audio recording) is requested as 'display-capture';
  // without it the capture window's getUserMedia call is denied.
  const allowed = ['media', 'microphone', 'audioCapture', 'desktopCapture', 'display-capture'];
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => allowed.includes(permission));

  // Serve local image files via app-image:// protocol
  protocol.handle('app-image', (request) => {
    const filename = decodeURIComponent(new URL(request.url).hostname);
    if (!filename || filename !== path.basename(filename)) return new Response('Invalid image', { status: 400 });
    return net.fetch(pathToFileURL(path.join(IMAGES_DIR, filename)).href);
  });

  createWindow();

  // electron-updater writes its own detailed log (download, signature check, installer
  // launch) to hivemind.log — the first place to look when antivirus blocks an update.
  autoUpdater.logger = log;
  autoUpdater.on('checking-for-update', () => log.info('Checking for updates'));
  autoUpdater.on('update-available', (info) => {
    log.info('Update available', { version: info.version });
    sendToMainWindow('updater:update-available', { version: info.version });
  });
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded', { version: info.version });
    sendToMainWindow('updater:update-downloaded', { version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    sendToMainWindow('updater:update-not-available');
  });
  autoUpdater.on('error', (err) => {
    log.error('Updater error', { message: err?.message });
    sendToMainWindow('updater:error', { message: err?.message || 'Unknown update error' });
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((e) => log.warn('Update check failed', { message: e?.message }));
  }
});

// Queued data-file writes must finish before the process exits; otherwise the last edits are lost.
let storageFlushedForQuit = false;
app.on('before-quit', (event) => {
  if (storageFlushedForQuit || storage.pending === 0) return;
  event.preventDefault();
  storage.flush().catch((error) => log.error('Saving before quit failed', { message: error.message }))
    .finally(() => { storageFlushedForQuit = true; app.quit(); });
});

app.on('window-all-closed', () => {
  disconnectFromTeams();
  closeOverlay();
  if (captureWindow && !captureWindow.isDestroyed()) { captureWindow.close(); captureWindow = null; }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
