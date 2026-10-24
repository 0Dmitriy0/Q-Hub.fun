/* Оновлення програми: раз на кілька годин програма дивиться в реліз «desktop-latest» (latest.yml поруч з інсталятором).
   Є новіша версія — кабінет і трей показують кнопку «Оновити»; натиснув — програма завантажує інсталятор,
   закривається, тихо ставить нову версію й запускається знову. Без кнопки сама нічого не завантажує.
   Перехід станів — чиста функція reduce (перевіряється updater.test.cjs), робота з electron-updater — у createUpdater. */

/* status: idle — нового немає; available — є нова версія; downloading — завантажується; ready — завантажено, ставиться */
const IDLE = { status: 'idle', version: null, percent: 0, error: null };

function reduce(s, [type, data]) {
  switch (type) {
    case 'available': return { ...s, status: 'available', version: data?.version || s.version, error: null };
    case 'none': return s.status === 'idle' ? s : { ...IDLE };
    case 'start': return s.version ? { ...s, status: 'downloading', percent: 0, error: null } : s;
    case 'progress': return s.status === 'downloading' ? { ...s, percent: Math.max(0, Math.min(100, Math.round(data?.percent || 0))) } : s;
    case 'downloaded': return { ...s, status: 'ready', version: data?.version || s.version, percent: 100, error: null };
    /* перевірка без інтернету — тихо; помилка завантаження — показати й дати спробувати ще */
    case 'error': return s.status === 'downloading' ? { ...s, status: 'available', error: 'Не вдалося завантажити оновлення. Перевір інтернет і спробуй ще раз.' } : s;
    default: return s;
  }
}

/* deps: autoUpdater (electron-updater), onChange(state), beforeInstall() — щоб хрестик вікна не перехопив вихід, log(text) */
function createUpdater({ autoUpdater, onChange, beforeInstall, log = () => {} }) {
  let st = { ...IDLE }, installing = false;
  const set = ev => { const next = reduce(st, ev); if (next !== st) { st = next; onChange(st); } };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('update-available', i => set(['available', i]));
  autoUpdater.on('update-not-available', () => set(['none']));
  autoUpdater.on('download-progress', p => set(['progress', p]));
  autoUpdater.on('update-downloaded', i => {
    set(['downloaded', i]);
    if (installing) { beforeInstall(); autoUpdater.quitAndInstall(true, true); }
  });
  autoUpdater.on('error', e => { log('update error ' + (e?.message || e)); installing = false; set(['error']); });

  return {
    state: () => st,
    check: () => { if (st.status === 'idle' || st.status === 'available') autoUpdater.checkForUpdates().catch(e => log('update check ' + (e?.message || e))); },
    /* кнопка «Оновити»: завантажити (якщо ще ні) і поставити */
    install: () => {
      if (st.status === 'ready') { beforeInstall(); autoUpdater.quitAndInstall(true, true); return; }
      if (st.status !== 'available' || installing) return;
      installing = true; set(['start']);
      autoUpdater.downloadUpdate().catch(() => { /* подію error уже оброблено вище */ });
    },
  };
}

module.exports = { IDLE, reduce, createUpdater };
