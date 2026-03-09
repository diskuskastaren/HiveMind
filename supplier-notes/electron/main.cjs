const { app, BrowserWindow, ipcMain, Menu, MenuItem, protocol, net, desktopCapturer, shell, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { WebSocket } = require('ws');
const { execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

// Debug logging — writes NDJSON to workspace root
const DEBUG_LOG = path.join(__dirname, '..', 'debug-0a018f.log');
ipcMain.on('debug:log', (_event, payload) => {
  try { fs.appendFileSync(DEBUG_LOG, JSON.stringify(payload) + '\n'); } catch {}
});

const DATA_FILE = path.join(app.getPath('userData'), 'supplier-notes-data.json');
const IMAGES_DIR = path.join(app.getPath('userData'), 'images');
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

function closeOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
    overlayWindow = null;
  }
}

ipcMain.on('overlay:start-recording', (_event) => {
  const mainWindow = BrowserWindow.getAllWindows().find((w) => w !== overlayWindow);
  closeOverlay();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('teams:meeting-joined');
  }
});

ipcMain.on('overlay:dismiss', () => {
  closeOverlay();
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

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

app.whenReady().then(() => {
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

  autoUpdater.checkForUpdates();
});

app.on('window-all-closed', () => {
  if (teamsRetryTimer) { clearTimeout(teamsRetryTimer); teamsRetryTimer = null; }
  if (teamsWs) { teamsWs.terminate(); teamsWs = null; }
  closeOverlay();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const win = createWindow();
    connectToTeams(win);
  }
});
