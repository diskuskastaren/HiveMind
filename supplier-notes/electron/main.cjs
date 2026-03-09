const { app, BrowserWindow, ipcMain, Menu, MenuItem, protocol, net, desktopCapturer, shell, screen, dialog, crashReporter } = require('electron');
const path = require('path');
const fs = require('fs');
const { WebSocket } = require('ws');
const { execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

// #region agent log — native crash reporter (captures GPU/C++ crashes JS handlers miss)
crashReporter.start({ uploadToServer: false });
// #endregion


// #region agent log
// Writable log paths — userData is always writable in both dev and packaged app.
// __dirname inside an ASAR is read-only, so we MUST use app.getPath('userData').
function _dbgLogPath() {
  try { return path.join(app.getPath('userData'), 'debug-6cf3ea.log'); } catch { return path.join(require('os').homedir(), 'debug-6cf3ea.log'); }
}
function _dbgWrite(obj) {
  try { fs.appendFileSync(_dbgLogPath(), JSON.stringify(obj) + '\n'); } catch {}
}

// Global crash handlers — catch the exact error before the process dies.
process.on('uncaughtException', (err) => {
  _dbgWrite({sessionId:'6cf3ea',type:'uncaughtException',error:err?.message,stack:err?.stack,timestamp:Date.now()});
  try { dialog.showErrorBox('[Combobulator debug] Uncaught exception — please screenshot', String(err?.stack || err)); } catch {}
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : '';
  _dbgWrite({sessionId:'6cf3ea',type:'unhandledRejection',error:msg,stack,timestamp:Date.now()});
  try { dialog.showErrorBox('[Combobulator debug] Unhandled rejection — please screenshot', String(stack || msg)); } catch {}
});

// IPC debug log forwarding (renderer → file)
const DEBUG_LOG = path.join(__dirname, '..', 'debug-0a018f.log');
ipcMain.on('debug:log', (_event, payload) => {
  if (payload && payload.sessionId === '6cf3ea') { _dbgWrite(payload); return; }
  try { fs.appendFileSync(DEBUG_LOG, JSON.stringify(payload) + '\n'); } catch {}
});
// #endregion

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

function saveAppConfig(cfg) {
  try {
    fs.writeFileSync(APP_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save app config:', e);
  }
}

function getDataDir() {
  const cfg = loadAppConfig();
  return cfg.customDataDir || app.getPath('userData');
}

let DATA_FILE = path.join(getDataDir(), 'Combobulator-data.json');
let IMAGES_DIR = path.join(getDataDir(), 'images');
// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// Register custom protocol for serving local images
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-image', privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);

ipcMain.handle('store:read', () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return fs.readFileSync(DATA_FILE, 'utf-8');
    }
  } catch (e) {
    console.error('Failed to read data file:', e);
  }
  return null;
});

ipcMain.handle('store:write', (_event, data) => {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, data, 'utf-8');
  } catch (e) {
    console.error('Failed to write data file:', e);
  }
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
  const oldDataFile = DATA_FILE;
  const oldImagesDir = IMAGES_DIR;
  const newDataFile = path.join(newDir, 'Combobulator-data.json');
  const newImagesDir = path.join(newDir, 'images');

  // Copy existing data file if present and new location doesn't already have one
  try {
    if (fs.existsSync(oldDataFile) && !fs.existsSync(newDataFile)) {
      fs.copyFileSync(oldDataFile, newDataFile);
    }
  } catch (e) {
    console.error('Failed to copy data file:', e);
    return { changed: false, error: 'Could not copy data file to new location.' };
  }

  // Copy images directory contents if present
  try {
    if (fs.existsSync(oldImagesDir)) {
      if (!fs.existsSync(newImagesDir)) fs.mkdirSync(newImagesDir, { recursive: true });
      const files = fs.readdirSync(oldImagesDir);
      for (const file of files) {
        const dest = path.join(newImagesDir, file);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(path.join(oldImagesDir, file), dest);
        }
      }
    }
  } catch (e) {
    console.error('Failed to copy images:', e);
    // Non-fatal — data file already copied, continue
  }

  // Persist the choice
  const cfg = loadAppConfig();
  cfg.customDataDir = newDir;
  saveAppConfig(cfg);

  // Relaunch so all paths are re-resolved from the new location
  app.relaunch();
  app.exit(0);
  return { changed: true };
});

ipcMain.handle('store:resetDataDir', async () => {
  const cfg = loadAppConfig();
  delete cfg.customDataDir;
  saveAppConfig(cfg);
  app.relaunch();
  app.exit(0);
  return { changed: true };
});

ipcMain.handle('updater:check', () => autoUpdater.checkForUpdates());
ipcMain.handle('updater:install', () => { autoUpdater.quitAndInstall(); });

// Return screen source IDs so the renderer can capture system audio
ipcMain.handle('desktop:getSources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  } catch (e) {
    console.error('Failed to get desktop sources:', e);
    return [];
  }
});

// Save an image buffer to the images folder, return the filename
ipcMain.handle('image:save', (_event, buffer, ext) => {
  try {
    const filename = `img-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext || 'png'}`;
    const filepath = path.join(IMAGES_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return filename;
  } catch (e) {
    console.error('Failed to save image:', e);
    return null;
  }
});

// Delete an image file from the images folder
ipcMain.handle('image:delete', (_event, filename) => {
  try {
    const filepath = path.join(IMAGES_DIR, filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (e) {
    console.error('Failed to delete image:', e);
  }
});

// Show native file picker and return selected file paths
ipcMain.handle('dialog:openFiles', async (_event) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win || BrowserWindow.getAllWindows()[0], {
    properties: ['openFile', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

// Open a referenced attachment from its original location
ipcMain.handle('attachment:open', (_event, filePath) => {
  return shell.openPath(filePath);
});

// Open URL in system default app (e.g. mailto: → Outlook)
ipcMain.handle('shell:openExternal', (_event, url) => {
  return shell.openExternal(url);
});

// Create a new Outlook email with HTML body via a temporary .eml file.
// Opening the file via shell.openExternal uses the default mail client
// (correct Outlook version), and X-Unsent: 1 opens it in compose mode.
ipcMain.handle('mail:openOutlook', async (_event, subject, htmlBody) => {
  try {
    const os = require('os');
    const tmpFile = path.join(os.tmpdir(), `outlook-draft-${Date.now()}.eml`);
    const eml = [
      'MIME-Version: 1.0',
      'X-Unsent: 1',
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody,
    ].join('\r\n');
    fs.writeFileSync(tmpFile, eml, 'utf-8');
    await shell.openExternal(tmpFile);
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 15000);
    return true;
  } catch (e) {
    console.error('Failed to open Outlook draft:', e);
    return false;
  }
});

// ── Teams overlay window ───────────────────────────────────────────────────────
let overlayWindow = null;

function showOverlay(mainWindow) {
  if (overlayWindow && !overlayWindow.isDestroyed()) return;

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
      preload: path.join(__dirname, 'preload.cjs'),
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

// #region agent log — track time of overlay click so we can correlate WS messages
let _overlayClickedAt = 0;
// #endregion

ipcMain.on('overlay:start-recording', (_event) => {
  // #region agent log
  _overlayClickedAt = Date.now();
  _dbgWrite({sessionId:'6cf3ea',location:'main.cjs:overlay:start-recording',message:'overlay start-recording IPC received',data:{allWindowsCount:BrowserWindow.getAllWindows().length,overlayWindowExists:!!(overlayWindow&&!overlayWindow.isDestroyed())},timestamp:_overlayClickedAt,hypothesisId:'H-HIDE'});
  // #endregion
  const mainWindow = BrowserWindow.getAllWindows().find((w) => w !== overlayWindow);

  // Hide (not destroy) the overlay. Teams is still actively rendering video, so
  // destroying the transparent/layered HWND here would crash the main process via
  // DWM/NVIDIA (ntdll/gdi32). The actual destroy happens in destroyOverlay() when
  // the Teams meeting ends and Teams has stopped rendering.
  hideOverlay();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    // #region agent log
    _dbgWrite({sessionId:'6cf3ea',location:'main.cjs:overlay:start-recording',message:'sending teams:meeting-joined to renderer',data:{mainWindowDestroyed:mainWindow.isDestroyed()},timestamp:Date.now(),hypothesisId:'H-HIDE'});
    // #endregion
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
    },
  });

  captureWindow.loadFile(path.join(__dirname, 'capture.html'));

  // If the GPU process inside the capture window crashes, notify the main renderer
  // but leave the main app running.
  captureWindow.webContents.on('render-process-gone', (_event, details) => {
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

  // Ask the capture window to start, then wait for either success or failure.
  return new Promise((resolve, reject) => {
    const onReady = (_e, mimeType) => {
      ipcMain.removeListener('capture:error', onError);
      resolve(mimeType);
    };
    const onError = (_e, msg) => {
      ipcMain.removeListener('capture:ready', onReady);
      reject(new Error(msg));
    };
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

// Forward audio chunks from the capture window to the main renderer.
ipcMain.on('capture:chunk', (_event, buffer) => {
  if (captureMainWindow && !captureMainWindow.isDestroyed()) {
    captureMainWindow.webContents.send('capture:chunk', buffer);
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

function connectToTeams(mainWindow) {
  if (teamsConnected) return;

  const token = loadTeamsToken();
  const url = `ws://localhost:8124?token=${token}&protocol-version=2.0.0&manufacturer=HiveMind&device=Combobulator&app=Combobulator&app-version=1.0`;

  try {
    teamsWs = new WebSocket(url);
  } catch {
    scheduleTeamsReconnect(mainWindow);
    return;
  }

  teamsWs.on('open', () => {
    teamsConnected = true;
  });

  teamsWs.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // #region agent log — log WS messages in the 10s window after overlay click
    if (_overlayClickedAt && (Date.now() - _overlayClickedAt) < 10000) {
      _dbgWrite({sessionId:'6cf3ea',location:'main.cjs:teamsWs:message',message:'Teams WS message received after overlay click',data:{msAfterClick:Date.now()-_overlayClickedAt,isInMeeting:msg.meetingUpdate?.meetingState?.isInMeeting,canPair:msg.meetingUpdate?.meetingPermissions?.canPair,hasTokenRefresh:!!msg.tokenRefresh,teamsWasInMeeting},timestamp:Date.now(),hypothesisId:'H-WS'});
    }
    // #endregion

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
      showOverlay(mainWindow);
    } else if (!isInMeeting && teamsWasInMeeting) {
      teamsWasInMeeting = false;
      closeOverlay();
    }
  });

  teamsWs.on('close', () => {
    teamsConnected = false;
    teamsWs = null;
    scheduleTeamsReconnect(mainWindow);
  });

  teamsWs.on('error', () => {
    // 'close' fires after 'error', reconnect handled there
  });
}

function scheduleTeamsReconnect(mainWindow) {
  if (teamsRetryTimer) return;
  teamsRetryTimer = setTimeout(() => {
    teamsRetryTimer = null;
    connectToTeams(mainWindow);
  }, 10000);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'Combobulator',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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

  // #region agent log — renderer crash handler
  win.webContents.on('render-process-gone', (_e, details) => {
    _dbgWrite({sessionId:'6cf3ea',location:'main.cjs:render-process-gone',message:'Renderer process gone',data:{reason:details.reason,exitCode:details.exitCode,msAfterOverlayClick:_overlayClickedAt ? Date.now()-_overlayClickedAt : null},timestamp:Date.now(),hypothesisId:'H-RENDERER'});
    try { dialog.showErrorBox('[Combobulator debug] Renderer crashed — please screenshot', `Reason: ${details.reason}  ExitCode: ${details.exitCode}`); } catch {}
  });
  // #endregion

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  // #region agent log — write startup entry immediately so we can confirm build version + log path
  _dbgWrite({sessionId:'6cf3ea',type:'startup',version:'1.2.2',userData:app.getPath('userData'),crashDumps:app.getPath('crashDumps'),timestamp:Date.now()});
  // #endregion
  // Grant microphone and media permissions so Web Speech API and getUserMedia work
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'desktopCapture'];
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'desktopCapture'];
    return allowed.includes(permission);
  });

  // Serve local image files via app-image:// protocol
  protocol.handle('app-image', (request) => {
    const filename = decodeURIComponent(new URL(request.url).hostname);
    const filepath = path.join(IMAGES_DIR, filename);
    return net.fetch(`file://${filepath}`);
  });

  const win = createWindow();
  connectToTeams(win);

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('updater:update-available', { version: info.version });
  });
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('updater:update-downloaded', { version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    win.webContents.send('updater:update-not-available');
  });
  autoUpdater.on('error', (err) => {
    win.webContents.send('updater:error', { message: err.message });
  });

  autoUpdater.checkForUpdates().catch((e) => {
    _dbgWrite({sessionId:'6cf3ea',location:'main.cjs:autoUpdater.checkForUpdates',message:'checkForUpdates rejected',data:{error:String(e?.message||e)},timestamp:Date.now(),hypothesisId:'H-UPDATER'});
  });
});

app.on('window-all-closed', () => {
  if (teamsRetryTimer) { clearTimeout(teamsRetryTimer); teamsRetryTimer = null; }
  if (teamsWs) { teamsWs.terminate(); teamsWs = null; }
  closeOverlay();
  if (captureWindow && !captureWindow.isDestroyed()) { captureWindow.close(); captureWindow = null; }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createWindow();
    connectToTeams(win);
  }
});
