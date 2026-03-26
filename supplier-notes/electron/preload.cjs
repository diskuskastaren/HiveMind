const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronStore', {
  read: () => ipcRenderer.invoke('store:read'),
  write: (data) => ipcRenderer.invoke('store:write', data),
  getPath: () => ipcRenderer.invoke('store:path'),
  openFolder: () => ipcRenderer.invoke('store:openFolder'),
  getDataDir: () => ipcRenderer.invoke('store:getDataDir'),
  changeDataDir: () => ipcRenderer.invoke('store:changeDataDir'),
  resetDataDir: () => ipcRenderer.invoke('store:resetDataDir'),
});

contextBridge.exposeInMainWorld('electronImages', {
  save: (buffer, ext) => ipcRenderer.invoke('image:save', buffer, ext),
  delete: (filename) => ipcRenderer.invoke('image:delete', filename),
});

contextBridge.exposeInMainWorld('electronAttachments', {
  pick: () => ipcRenderer.invoke('dialog:openFiles'),
  open: (filePath) => ipcRenderer.invoke('attachment:open', filePath),
});

// Maps from caller-supplied callback → IPC wrapper, so we can removeListener correctly.
const _captureChunkWrappers  = new Map();
const _captureErrorWrappers  = new Map();
const _captureLevelsWrappers = new Map();

contextBridge.exposeInMainWorld('electronCapture', {
  getSources: () => ipcRenderer.invoke('desktop:getSources'),

  // Start capture in the hidden window; resolves with the chosen mimeType string.
  startCapture: (sourceId) => ipcRenderer.invoke('desktop:startCapture', sourceId),

  // Signal the hidden window to stop; resolves only after all final chunks arrive.
  stopCapture: () => ipcRenderer.invoke('desktop:stopCapture'),

  // Register/unregister a handler for incoming audio chunk ArrayBuffers.
  onChunk: (cb) => {
    const wrapper = (_e, buf) => cb(buf);
    _captureChunkWrappers.set(cb, wrapper);
    ipcRenderer.on('capture:chunk', wrapper);
  },
  offChunk: (cb) => {
    const wrapper = _captureChunkWrappers.get(cb);
    if (wrapper) {
      ipcRenderer.removeListener('capture:chunk', wrapper);
      _captureChunkWrappers.delete(cb);
    }
  },

  // Register/unregister a handler for capture-window error messages.
  onError: (cb) => {
    const wrapper = (_e, msg) => cb(msg);
    _captureErrorWrappers.set(cb, wrapper);
    ipcRenderer.on('capture:error', wrapper);
  },
  offError: (cb) => {
    const wrapper = _captureErrorWrappers.get(cb);
    if (wrapper) {
      ipcRenderer.removeListener('capture:error', wrapper);
      _captureErrorWrappers.delete(cb);
    }
  },

  // Register/unregister a handler for visualizer frequency level arrays (~30 fps).
  onLevels: (cb) => {
    const wrapper = (_e, data) => cb(data);
    _captureLevelsWrappers.set(cb, wrapper);
    ipcRenderer.on('capture:levels', wrapper);
  },
  offLevels: (cb) => {
    const wrapper = _captureLevelsWrappers.get(cb);
    if (wrapper) {
      ipcRenderer.removeListener('capture:levels', wrapper);
      _captureLevelsWrappers.delete(cb);
    }
  },
});

contextBridge.exposeInMainWorld('electronDebug', {
  log: (payload) => ipcRenderer.send('debug:log', payload),
});

contextBridge.exposeInMainWorld('electronOpenExternal', {
  open: (url) => ipcRenderer.invoke('shell:openExternal', url),
});

contextBridge.exposeInMainWorld('electronOutlookMail', {
  open: (subject, htmlBody) => ipcRenderer.invoke('mail:openOutlook', subject, htmlBody),
});

// Wrapper maps so ipcRenderer.removeListener can find the correct function reference.
// Passing `cb` (a contextBridge proxy) directly to ipcRenderer.on causes Electron 40
// to throw a structured-clone error when the IpcRendererEvent is forwarded to the
// renderer world (it contains a non-cloneable WebContents `sender` property).
const _teamsJoinedWrappers = new Map();
const _teamsLeftWrappers   = new Map();

contextBridge.exposeInMainWorld('electronTeams', {
  onMeetingJoined: (cb) => {
    const wrapper = () => {
      // #region agent log
      ipcRenderer.send('debug:log', {sessionId:'6cf3ea',location:'preload.cjs:onMeetingJoined-wrapper',message:'teams:meeting-joined received - calling cb without event',timestamp:Date.now(),hypothesisId:'H-FINAL'});
      // #endregion
      cb();
    };
    _teamsJoinedWrappers.set(cb, wrapper);
    ipcRenderer.on('teams:meeting-joined', wrapper);
  },
  onMeetingLeft: (cb) => {
    const wrapper = () => cb();
    _teamsLeftWrappers.set(cb, wrapper);
    ipcRenderer.on('teams:meeting-left', wrapper);
  },
  offMeetingJoined: (cb) => {
    const wrapper = _teamsJoinedWrappers.get(cb);
    if (wrapper) { ipcRenderer.removeListener('teams:meeting-joined', wrapper); _teamsJoinedWrappers.delete(cb); }
  },
  offMeetingLeft: (cb) => {
    const wrapper = _teamsLeftWrappers.get(cb);
    if (wrapper) { ipcRenderer.removeListener('teams:meeting-left', wrapper); _teamsLeftWrappers.delete(cb); }
  },
});

contextBridge.exposeInMainWorld('electronOverlay', {
  startRecording: () => ipcRenderer.send('overlay:start-recording'),
  dismiss:        () => ipcRenderer.send('overlay:dismiss'),
});

const _updaterAvailableWrappers    = new Map();
const _updaterDownloadedWrappers   = new Map();
const _updaterNotAvailableWrappers = new Map();
const _updaterErrorWrappers        = new Map();

contextBridge.exposeInMainWorld('electronUpdater', {
  check:   () => ipcRenderer.invoke('updater:check'),
  install: () => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable: (cb) => {
    const w = (_e, ...a) => cb(...a); _updaterAvailableWrappers.set(cb, w);
    ipcRenderer.on('updater:update-available', w);
  },
  onUpdateDownloaded: (cb) => {
    const w = (_e, ...a) => cb(...a); _updaterDownloadedWrappers.set(cb, w);
    ipcRenderer.on('updater:update-downloaded', w);
  },
  onUpdateNotAvailable: (cb) => {
    const w = (_e, ...a) => cb(...a); _updaterNotAvailableWrappers.set(cb, w);
    ipcRenderer.on('updater:update-not-available', w);
  },
  onError: (cb) => {
    const w = (_e, ...a) => cb(...a); _updaterErrorWrappers.set(cb, w);
    ipcRenderer.on('updater:error', w);
  },
  offUpdateAvailable:    (cb) => { const w = _updaterAvailableWrappers.get(cb);    if (w) { ipcRenderer.removeListener('updater:update-available',    w); _updaterAvailableWrappers.delete(cb);    } },
  offUpdateDownloaded:   (cb) => { const w = _updaterDownloadedWrappers.get(cb);   if (w) { ipcRenderer.removeListener('updater:update-downloaded',   w); _updaterDownloadedWrappers.delete(cb);   } },
  offUpdateNotAvailable: (cb) => { const w = _updaterNotAvailableWrappers.get(cb); if (w) { ipcRenderer.removeListener('updater:update-not-available', w); _updaterNotAvailableWrappers.delete(cb); } },
  offError:              (cb) => { const w = _updaterErrorWrappers.get(cb);        if (w) { ipcRenderer.removeListener('updater:error',               w); _updaterErrorWrappers.delete(cb);        } },
});
