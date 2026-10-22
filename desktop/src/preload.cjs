/* міст між вікном і головним процесом: вікно не має доступу до Node, лише до цих викликів */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('qhub', {
  state: () => ipcRenderer.invoke('state'),
  login: () => ipcRenderer.invoke('login'),
  logout: () => ipcRenderer.invoke('logout'),
  character: id => ipcRenderer.invoke('character', id),
  site: path => ipcRenderer.invoke('site', path),
  cabinet: () => ipcRenderer.invoke('cabinet'),
  /* для кабінету сайту: токени сесії програми і їх оновлення */
  session: () => ipcRenderer.invoke('session'),
  onSession: cb => { ipcRenderer.on('session', (_e, t) => cb(t)); },
});
