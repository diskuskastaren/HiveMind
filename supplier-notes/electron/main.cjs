const { app, BrowserWindow, ipcMain, Menu, MenuItem, protocol, net, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'Supplier Meeting Notes',
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

  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
