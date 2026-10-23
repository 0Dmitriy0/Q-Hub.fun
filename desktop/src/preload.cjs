/* міст між вікном і головним процесом: вікно не має доступу до Node, лише до цих викликів */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('qhub', {
  state: () => ipcRenderer.invoke('state'),
  login: () => ipcRenderer.invoke('login'),
  logout: () => ipcRenderer.invoke('logout'),
  character: id => ipcRenderer.invoke('character', id),
  site: path => ipcRenderer.invoke('site', path),
  cabinet: () => ipcRenderer.invoke('cabinet'),
  openBar: () => ipcRenderer.invoke('open-bar'),
  hotkey: () => ipcRenderer.invoke('hotkey'),
  /* рядок швидкого запису (Alt+Q) */
  quickParse: text => ipcRenderer.invoke('quick-parse', text),
  quickAdd: text => ipcRenderer.invoke('quick-add', text),
  quickAsk: text => ipcRenderer.invoke('quick-ask', text),
  quickRun: () => ipcRenderer.invoke('quick-run'),
  quickSize: h => ipcRenderer.invoke('quick-size', h),
  quickHide: () => ipcRenderer.invoke('quick-hide'),
  quickDeal: (op, item, qty, price) => ipcRenderer.invoke('quick-deal', op, item, qty, price),
  barData: () => ipcRenderer.invoke('bar-data'),
  barHistory: () => ipcRenderer.invoke('bar-history'),
  barCharacter: id => ipcRenderer.invoke('bar-character', id),
  barPrefs: p => ipcRenderer.invoke('bar-prefs', p),
  barCabinet: () => ipcRenderer.invoke('bar-cabinet'),
  /* навчальні знімки (Alt+S) */
  onShot: cb => { ipcRenderer.on('shot', (_e, s) => cb(s)); },
  shotLabel: (name, label, note, share) => ipcRenderer.invoke('shot-label', name, label, note, share),
  shotsStats: () => ipcRenderer.invoke('shots-stats'),
  shotsOpen: () => ipcRenderer.invoke('shots-open'),
  visionLogOpen: () => ipcRenderer.invoke('vision-log-open'),
  onQuickShow: cb => { ipcRenderer.on('quick-show', () => cb()); },
  /* для кабінету сайту: токени сесії програми і їх оновлення */
  session: () => ipcRenderer.invoke('session'),
  onSession: cb => { ipcRenderer.on('session', (_e, t) => cb(t)); },
  /* дані змінилися поза сторінкою (Alt+Q) — повертає відписку */
  onChanged: cb => { const f = () => cb(); ipcRenderer.on('changed', f); return () => ipcRenderer.removeListener('changed', f); },
});
