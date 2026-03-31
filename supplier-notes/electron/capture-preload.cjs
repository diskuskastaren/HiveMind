const { contextBridge, ipcRenderer } = require('electron');

// Minimal IPC bridge for the hidden audio-capture window.
// The capture window receives start/stop commands from the main process
// and sends audio chunks + lifecycle events back.
contextBridge.exposeInMainWorld('captureIpc', {
  onStart:     (cb) => ipcRenderer.on('capture:do-start', (_e, sourceId) => cb(sourceId)),
  onFlush:     (cb) => ipcRenderer.on('capture:do-flush', () => cb()),
  onStop:      (cb) => ipcRenderer.on('capture:do-stop',  () => cb()),
  sendChunk:   (buf)  => ipcRenderer.send('capture:chunk',   buf),
  sendFlushed: ()     => ipcRenderer.send('capture:flushed'),
  sendReady:   (mime) => ipcRenderer.send('capture:ready',   mime),
  sendError:   (msg)  => ipcRenderer.send('capture:error',   msg),
  sendStopped: ()     => ipcRenderer.send('capture:stopped'),
  sendLevels:  (data) => ipcRenderer.send('capture:levels',  data),
});
