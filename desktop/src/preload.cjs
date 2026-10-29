/* міст між вікном і головним процесом: вікно не має доступу до Node, лише до цих викликів */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('qhub', {
  state: () => ipcRenderer.invoke('state'),
  login: () => ipcRenderer.invoke('login'),
  logout: () => ipcRenderer.invoke('logout'),
  character: id => ipcRenderer.invoke('character', id),
  charAdd: p => ipcRenderer.invoke('char-add', p),
  nickSet: nick => ipcRenderer.invoke('nick-set', nick),
  site: path => ipcRenderer.invoke('site', path),
  cabinet: () => ipcRenderer.invoke('cabinet'),
  /* плашка входу: висота під вміст і хрестик у трей */
  gateSize: h => ipcRenderer.invoke('gate-size', h),
  gateHide: () => ipcRenderer.invoke('gate-hide'),
  openBar: () => ipcRenderer.invoke('open-bar'),
  hotkey: () => ipcRenderer.invoke('hotkey'),
  /* рядок швидкого запису (Alt+Q) */
  quickParse: (text, buyer) => ipcRenderer.invoke('quick-parse', text, buyer),
  quickAdd: (text, buyer) => ipcRenderer.invoke('quick-add', text, buyer),
  quickAsk: (text, rules) => ipcRenderer.invoke('quick-ask', text, rules),
  quickRun: () => ipcRenderer.invoke('quick-run'),
  quickSize: (h, w) => ipcRenderer.invoke('quick-size', h, w),
  quickHide: () => ipcRenderer.invoke('quick-hide'),
  barData: () => ipcRenderer.invoke('bar-data'),
  rulesData: () => ipcRenderer.invoke('rules-data'),
  onRulesChanged: cb => { ipcRenderer.on('rules-changed', () => cb()); },
  /* історія — окрема плашка: плашка пише й відкриває її, вікно історії читає й повертає вибране */
  histAdd: it => ipcRenderer.invoke('hist-add', it),
  histData: () => ipcRenderer.invoke('hist-data'),
  histDel: id => ipcRenderer.invoke('hist-del', id),
  histClear: () => ipcRenderer.invoke('hist-clear'),
  onHistChanged: cb => { ipcRenderer.on('hist-changed', () => cb()); },
  /* мапа Q-Hub поверх гри (specs/014): плашка відкриває, вікно мапи ховається */
  mapToggle: () => ipcRenderer.invoke('map-toggle'),
  mapHide: () => ipcRenderer.invoke('map-hide'),
  mapKey: () => ipcRenderer.invoke('map-key'),
  mapOpen: p => ipcRenderer.invoke('map-open', p),
  mapFocusTake: () => ipcRenderer.invoke('map-focus-take'),
  /* «Де я?»: кнопкою — відповідь одразу; клавішею при відкритій великій карті — подіями (спершу «шукаю») */
  mapWhere: () => ipcRenderer.invoke('map-where'),
  onMapWhere: cb => { const f = (_e, r) => cb(r); ipcRenderer.on('map-where', f); return () => ipcRenderer.removeListener('map-where', f); },
  onMapFocus: cb => { const f = (_e, p) => cb(p); ipcRenderer.on('map-focus', f); return () => ipcRenderer.removeListener('map-focus', f); },
  onMapShown: cb => { const f = (_e, s) => cb(s); ipcRenderer.on('map-shown', f); return () => ipcRenderer.removeListener('map-shown', f); },
  aiLeft: () => ipcRenderer.invoke('ai-left'),
  barCharacter: id => ipcRenderer.invoke('bar-character', id),
  barPrefs: p => ipcRenderer.invoke('bar-prefs', p),
  /* навчальні знімки (Alt+S) */
  onShot: cb => { ipcRenderer.on('shot', (_e, s) => cb(s)); },
  /* F9: результат чернетки мітки — текст у плашці */
  onPin: cb => { ipcRenderer.on('pin', (_e, s) => cb(s)); },
  /* F9 без точки: показати знімок і причину, відповідь — надіслати чи ні */
  onPinAsk: cb => { ipcRenderer.on('pin-ask', (_e, s) => cb(s)); },
  pinDecide: (send, hint) => ipcRenderer.invoke('pin-decide', send, hint),
  shotLabel: (name, label, note, share) => ipcRenderer.invoke('shot-label', name, label, note, share),
  shotsStats: () => ipcRenderer.invoke('shots-stats'),
  shotsOpen: () => ipcRenderer.invoke('shots-open'),
  visionLogOpen: () => ipcRenderer.invoke('vision-log-open'),
  onQuickShow: cb => { ipcRenderer.on('quick-show', () => cb()); },
  /* для кабінету сайту: токени сесії програми і їх оновлення */
  session: () => ipcRenderer.invoke('session'),
  onSession: cb => { ipcRenderer.on('session', (_e, t) => cb(t)); },
  /* оновлення програми: стан, кнопка «Оновити», зміни стану — повертає відписку */
  updateState: () => ipcRenderer.invoke('update-state'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdate: cb => { const f = (_e, s) => cb(s); ipcRenderer.on('update', f); return () => ipcRenderer.removeListener('update', f); },
  /* дані змінилися поза сторінкою (Alt+Q) — повертає відписку */
  onChanged: cb => { const f = () => cb(); ipcRenderer.on('changed', f); return () => ipcRenderer.removeListener('changed', f); },
});
