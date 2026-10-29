/* Оновлення програми (specs/006): кожні 30 хв програма дивиться в реліз «desktop-latest» (latest.yml поруч з інсталятором).
   Автооновлення увімкнене (перемикач у Налаштуваннях) — нова версія завантажується у фоні й ставиться сама, коли програмою
   10 хв не користуються (installDue), або при виході. Вимкнене — як раніше: кабінет і трей показують кнопку «Оновити».
   Кнопка лишається й з автооновленням — поставити одразу. Ставиться з вікном інсталятора й прогресом.
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
    /* перевірка без інтернету — тихо; помилка завантаження після кнопки — показати й дати спробувати ще;
       фонового (quiet) — лише в журнал, наступна перевірка спробує знову */
    case 'error': return s.status !== 'downloading' ? s
      : { ...s, status: 'available', error: data?.quiet ? null : 'Не вдалося завантажити оновлення. Перевір інтернет і спробуй ще раз.' };
    default: return s;
  }
}

/* поки інсталятор міняє файли, програму не запускати: запущена копія тримає їх, і інсталятор падає з «не вдалось видалити
   старі файли» (2026-10-26, 0.2.59 — тихе встановлення, вікна не видно, і програму відкрили знову). Перед встановленням
   програма лишає позначку { from: стара версія, at }; запуск тієї ж версії протягом INSTALL_WAIT — оновлення ще йде */
const INSTALL_WAIT = 3 * 60e3;
const installPending = (mark, version, now) => !!mark && mark.from === version && now - mark.at >= 0 && now - mark.at < INSTALL_WAIT;

/* коли автооновлення ставить завантажену версію саме: програмою не користуються IDLE_BEFORE_INSTALL (плашка й кабінет
   сховані, нічого не вводиться) і після невдалої спроби минуло RETRY_AFTER_FAIL — інакше зламане оновлення ставилось би по колу */
const IDLE_BEFORE_INSTALL = 10 * 60e3, RETRY_AFTER_FAIL = 3 * 3600e3;
const installDue = ({ status, auto, idleMs, busy, failAt, now }) =>
  !!auto && status === 'ready' && !busy && idleMs >= IDLE_BEFORE_INSTALL && !(failAt && now - failAt >= 0 && now - failAt < RETRY_AFTER_FAIL);

/* де оновлення тримає файли: на тому ж диску, що й програма, а не на C: (2026-10-26: на C: лишалось 60–260 МБ, і інсталятор
   падав — він розпаковує ~400 МБ у %TEMP%, а завантаження лежать у %LOCALAPPDATA%). Тека — поруч з текою програми, не всередині:
   інсталятор очищає теку програми. D:\Q-HUB\Q-Hub.exe → D:\Q-Hub-update\{cache,temp} */
function updateDirs(exe, path = require('node:path').win32) {
  const appDir = path.dirname(exe), root = path.join(path.dirname(appDir), path.basename(appDir) + '-update');
  return { root, cache: path.join(root, 'cache'), temp: path.join(root, 'temp') };
}

/* deps: autoUpdater (electron-updater), onChange(state), beforeInstall() — щоб хрестик вікна не перехопив вихід, log(text),
   auto() — чи увімкнене автооновлення (тоді нова версія завантажується у фоні, без кнопки) */
function createUpdater({ autoUpdater, onChange, beforeInstall, log = () => {}, auto = () => false }) {
  let st = { ...IDLE }, installing = false, downloading = false;
  const set = ev => { const next = reduce(st, ev); if (next !== st) { st = next; onChange(st); } };
  /* інсталятор з вікном і прогресом (не тихо): видно, що оновлення ще ставиться; restart — після нього програма запуститься сама */
  const quitAndInstall = (restart = true) => { beforeInstall(); autoUpdater.quitAndInstall(false, restart); };
  /* manual — кнопка «Оновити»: поставити, щойно завантажиться; фонове — лише завантажити */
  const download = manual => {
    if (manual) installing = true;
    if (downloading) return;
    downloading = true; set(['start']);
    autoUpdater.downloadUpdate().catch(() => { /* подію error уже оброблено нижче */ });
  };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('update-available', i => { set(['available', i]); if (auto()) download(false); });
  autoUpdater.on('update-not-available', () => set(['none']));
  autoUpdater.on('download-progress', p => set(['progress', p]));
  autoUpdater.on('update-downloaded', i => {
    downloading = false;
    set(['downloaded', i]);
    if (installing) quitAndInstall();
  });
  autoUpdater.on('error', e => {
    log('update error ' + (e?.message || e));
    const quiet = !installing; installing = false; downloading = false;
    set(['error', { quiet }]);
  });

  return {
    state: () => st,
    check: () => { if (st.status === 'idle' || st.status === 'available') autoUpdater.checkForUpdates().catch(e => log('update check ' + (e?.message || e))); },
    /* кнопка «Оновити»: завантажити (або дочекатись фонового завантаження) і поставити */
    install: () => {
      if (st.status === 'ready') { quitAndInstall(); return; }
      if (st.status === 'available' || st.status === 'downloading') download(true);
    },
    /* автоматично: після простою — з перезапуском, при виході з програми — без нього. false — ставити нічого */
    installNow: ({ restart = true } = {}) => { if (st.status !== 'ready') return false; quitAndInstall(restart); return true; },
  };
}

module.exports = { IDLE, reduce, createUpdater, installPending, INSTALL_WAIT, installDue, IDLE_BEFORE_INSTALL, RETRY_AFTER_FAIL, updateDirs };
