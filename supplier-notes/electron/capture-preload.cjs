const { contextBridge, ipcRenderer } = require('electron');

// Minimal IPC bridge for the hidden audio-capture window.
// The capture window receives start/stop commands from the main process
// and sends audio chunks + lifecycle events back.
contextBridge.exposeInMainWorld('captureIpc', {
  onStart:     (cb) => ipcRenderer.on('capture:do-start', (_e, sourceId) => cb(sourceId)),
  onStop:      (cb) => ipcRenderer.on('capture:do-stop',  () => cb()),
  sendChunk:   (buf)  => ipcRenderer.send('capture:chunk',   buf),
  sendReady:   (mime) => ipcRenderer.send('capture:ready',   mime),
  sendError:   (msg)  => ipcRenderer.send('capture:error',   msg),
  sendStopped: ()     => ipcRenderer.send('capture:stopped'),
});
