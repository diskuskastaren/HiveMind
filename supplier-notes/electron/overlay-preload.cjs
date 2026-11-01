const { contextBridge, ipcRenderer } = require('electron');

// The Teams overlay only needs its two buttons. It deliberately does not get the main
// window's bridge (data file, attachments, updater…).
contextBridge.exposeInMainWorld('electronOverlay', {
  startRecording: () => ipcRenderer.send('overlay:start-recording'),
  dismiss: () => ipcRenderer.send('overlay:dismiss'),
});
