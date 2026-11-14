/* міст схованого вікна знімка екрана (grab.html): головний процес просить потік і кадри, вікно віддає бітмап */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('grab', {
  onStart: cb => { ipcRenderer.on('grab-start', (_e, p) => cb(p)); },
  onFrame: cb => { ipcRenderer.on('grab-frame', (_e, n) => cb(n)); },
  onStop: cb => { ipcRenderer.on('grab-stop', () => cb()); },
  started: r => ipcRenderer.send('grab-started', r),
  frame: (n, f) => ipcRenderer.send('grab-frame-done', n, f),
});
