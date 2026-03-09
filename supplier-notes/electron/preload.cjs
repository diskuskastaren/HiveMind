const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronStore', {
  read: () => ipcRenderer.invoke('store:read'),
  write: (data) => ipcRenderer.invoke('store:write', data),
  getPath: () => ipcRenderer.invoke('store:path'),
  openFolder: () => ipcRenderer.invoke('store:openFolder'),
});

contextBridge.exposeInMainWorld('electronImages', {
  save: (buffer, ext) => ipcRenderer.invoke('image:save', buffer, ext),
  delete: (filename) => ipcRenderer.invoke('image:delete', filename),
});

contextBridge.exposeInMainWorld('electronAttachments', {
  pick: () => ipcRenderer.invoke('dialog:openFiles'),
  open: (filePath) => ipcRenderer.invoke('attachment:open', filePath),
});

contextBridge.exposeInMainWorld('electronCapture', {
  getSources: () => ipcRenderer.invoke('desktop:getSources'),
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

contextBridge.exposeInMainWorld('electronTeams', {
  onMeetingJoined:  (cb) => ipcRenderer.on('teams:meeting-joined', cb),
  onMeetingLeft:    (cb) => ipcRenderer.on('teams:meeting-left', cb),
  offMeetingJoined: (cb) => ipcRenderer.removeListener('teams:meeting-joined', cb),
  offMeetingLeft:   (cb) => ipcRenderer.removeListener('teams:meeting-left', cb),
});

contextBridge.exposeInMainWorld('electronOverlay', {
  startRecording: () => ipcRenderer.send('overlay:start-recording'),
  dismiss:        () => ipcRenderer.send('overlay:dismiss'),
});

contextBridge.exposeInMainWorld('electronUpdater', {
  check:   () => ipcRenderer.invoke('updater:check'),
  install: () => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable:     (cb) => ipcRenderer.on('updater:update-available', cb),
  onUpdateDownloaded:    (cb) => ipcRenderer.on('updater:update-downloaded', cb),
  onUpdateNotAvailable:  (cb) => ipcRenderer.on('updater:update-not-available', cb),
  onError:               (cb) => ipcRenderer.on('updater:error', cb),
  offUpdateAvailable:    (cb) => ipcRenderer.removeListener('updater:update-available', cb),
  offUpdateDownloaded:   (cb) => ipcRenderer.removeListener('updater:update-downloaded', cb),
  offUpdateNotAvailable: (cb) => ipcRenderer.removeListener('updater:update-not-available', cb),
  offError:              (cb) => ipcRenderer.removeListener('updater:error', cb),
});
