const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronStore', {
  read: () => ipcRenderer.invoke('store:read'),
  write: (data) => ipcRenderer.invoke('store:write', data),
  getPath: () => ipcRenderer.invoke('store:path'),
});

contextBridge.exposeInMainWorld('electronImages', {
  save: (buffer, ext) => ipcRenderer.invoke('image:save', buffer, ext),
  delete: (filename) => ipcRenderer.invoke('image:delete', filename),
});

contextBridge.exposeInMainWorld('electronCapture', {
  getSources: () => ipcRenderer.invoke('desktop:getSources'),
});

contextBridge.exposeInMainWorld('electronDebug', {
  log: (payload) => ipcRenderer.send('debug:log', payload),
});
