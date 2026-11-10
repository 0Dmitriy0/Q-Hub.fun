/* Q-Hub Desktop — головний процес: вхід, вибір персонажа, плашка Alt+Q (пошук, ШІ, ціни), мапа, зір цін скупників,
   прибуток за годину сеансу з балансу HUD (лише показ — облік програма не веде, specs/040). */
const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog, globalShortcut, Tray, Menu, Notification, screen, desktopCapturer, nativeImage, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const cfg = require('./config.json');
const { makeClient, login } = require('./auth.cjs');
const { parseCharacter } = require('./character.cjs');
const { parseNick } = require('./nick.cjs');
const { fileStorage, writeAtomic, trimLog } = require('./store.cjs');
const { createNotifier } = require('./notify.cjs');
/* сповіщення: «час здавати», івенти, таймер оголошення — логіка з src/lib/alerts.ts (specs/075–077) */
const alerts = require('./lib/alerts.cjs');
const gameSession = require('./session.cjs');
const { sessionMoney, MAX_JUMP } = require('./sessionmoney.cjs');
const { randomUUID } = require('node:crypto');
const shots = require('./shots.cjs');
const { vision, TICK_POLL } = require('./vision.cjs');
const { createUpdater, installPending, installDue, updateDirs } = require('./updater.cjs');
const { autostartOnStart } = require('./autostart.cjs');
const { outbox, pinKeyConflict } = require('./outbox.cjs');
const mapmatch = require('./mapmatch.cjs');
const { loadMapRef } = require('./mapref.cjs');
const { createRules } = require('./rules.cjs');
const { createQmap } = require('./qmap.cjs');
const mapwin = require('./mapwin.cjs');
const { gameFocus, hwndOf } = require('./gamefocus.cjs');
const { Worker } = require('node:worker_threads');
const { createWorker } = require('tesseract.js');
const SHOT_KEY = 'Alt+S';
/* файли мапи для вікна мапи (qmap.cjs): схему треба оголосити до готовності програми */
protocol.registerSchemesAsPrivileged([{ scheme: 'qmap', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

/* ідентифікатор програми для Windows (сповіщення) НЕ задаємо: з типовим «electron.app.Q-Hub» сповіщення доходять,
   а з власним (шлях до exe) — ні: перевірено 2026-11-10 на Windows 11, Windows просто мовчки їх не показує */
const APP_ID = 'fun.q-hub.desktop';   // лише для ярлика на робочому столі (setDeskLink)

/* плашка Alt+Q — уся програма: ширина згорнутої (лише рядок), найбільша ширина й висота розгорнутої */
const BAR_W = 1120, BAR_MAX_W = 1120, BAR_MAX_H = 860;   // ширина плашки стала — як у розгорнутої (Bar.tsx BAR_WIDE)
/* ширина вікна плашки входу: сама плашка + прозоре поле під тінь */
const GATE_W = 520;

let sb, gate, bar, tray, quitting = false, settings = {};
const dir = () => app.getPath('userData');
const settingsFile = () => path.join(dir(), 'settings.json');
/* знімок правил з публічного бакета rules (функція rules-sync); dir() доступний лише після app ready — тож лінивий */
let rulesStore = null;
const rulesSnap = () => (rulesStore ??= createRules({ dir: dir(), url: cfg.url + '/storage/v1/object/public/rules/rules.json' }));
/* цілим файлом (store.cjs): обірваний запис не лишає битий settings.json — інакше програма забула б персонажа й сесію гри */
const saveSettings = () => writeAtomic(settingsFile(), JSON.stringify(settings, null, 2));
/* сповіщення Windows (notify.cjs): клік відкриває плашку */
const { notify } = createNotifier({ Notification, icon: path.join(__dirname, 'icon.png') });
const openFromToast = () => { showBar().catch(() => {}); };

/* лише адреси сайту й Discord відкриваються в браузері; все інше — ні */
const openExternal = url => { if (/^https:\/\//.test(url)) shell.openExternal(url); };
/* токени — лише нашим власним сторінкам з диска (вхід і кабінет) */
const trusted = e => (e.senderFrame?.url || '').startsWith('file:');

/* сесія для кабінету: оновлює її лише програма, сторінка отримує готові токени */
async function tokens() {
  const { data: { session } } = await sb.auth.getSession();
  return session ? { access_token: session.access_token, refresh_token: session.refresh_token, character: settings.character || null } : null;
}

/* вхід і вибір персонажа — окрема плашка без рамки, напівпрозора */
function showLogin() {
  if (gate) { gate.reload(); gate.show(); gate.focus(); return; }
  gate = new BrowserWindow({
    width: GATE_W, height: 420, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, maximizable: false, fullscreenable: false, title: 'Q-Hub', show: false, icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  guardPage(gate);
  gate.once('ready-to-show', () => { gate.center(); gate.show(); });
  gate.on('close', e => { if (!quitting) { e.preventDefault(); gate.hide(); } });
  gate.on('closed', () => { gate = null; });
  gate.loadFile(path.join(__dirname, 'index.html'));
}
/* персонажа вибрано — далі вся програма живе в плашці Alt+Q, плашка входу зникає */
function openHub() {
  if (gate) { const g = gate; gate = null; g.destroy(); }
  return showBar();
}
/* чи вибрано нік акаунта (specs/025): null — ще не знаємо; без ніка плашка не відкривається, ціни база не приймає */
let hasNick = null;
async function state() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { user: null };
  const meta = session.user.user_metadata || {};
  /* нік — акаунта (вибирає гравець), статік — у кожного персонажа свій (specs/025) */
  const [{ data: profile }, { data: chars, error }] = await Promise.all([
    sb.from('profiles').select('nick,nick_changed_at').eq('id', session.user.id).maybeSingle(),
    sb.from('characters').select('id,name,static_id').order('created_at'),
  ]);
  if (error) return { user: null, error: 'Не вдалося завантажити персонажів. Перевір інтернет і спробуй ще раз.' };
  hasNick = !!profile?.nick;
  const characters = (chars || []).map(c => ({ id: c.id, name: c.name, static: c.static_id ?? null }));
  if (!characters.some(c => c.id === settings.character)) { settings.character = characters[0]?.id || null; saveSettings(); }
  /* імена — для сповіщень таймера оголошення; таймер видаленого персонажа зникає (specs/077) */
  charNames = new Map(characters.map(c => [c.id, c.name]));
  const timers = alerts.marketPrune(settings.market, characters.map(c => c.id), Date.now());
  if (Object.keys(timers).length !== Object.keys(markets()).length) { settings.market = timers; saveSettings(); }
  return {
    user: { name: meta.custom_claims?.global_name || meta.full_name || meta.name || 'Гравець', avatar: meta.avatar_url || null,
      nick: profile?.nick || '', nickChangedAt: profile?.nick_changed_at || null },
    characters, character: settings.character,
  };
}
/* відмова бази з тригера (raise exception, код P0001) написана для гравця — показуємо як є; решта — загальний текст */
const dbMsg = (error, fallback) => (error?.code === 'P0001' && error.message ? error.message : fallback);

/* наші сторінки не переходять нікуди: посилання назовні — у браузер; як програма, а не сторінка — без масштабу й F5 */
function guardPage(w) {
  w.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { e.preventDefault(); openExternal(url); });
  w.webContents.setVisualZoomLevelLimits(1, 1);
  w.webContents.on('before-input-event', (e, i) => {
    if ((i.control && ['+', '-', '=', '0', 'r', 'R'].includes(i.key)) || i.key === 'F5') e.preventDefault();
  });
  w.webContents.on('zoom-changed', () => w.webContents.setZoomFactor(1));
}
const showMain = () => { if (gate) { gate.show(); gate.focus(); } else showBar().catch(() => {}); };

/* плашка швидкого запису: без рамки, поверх усього, зникає, щойно фокус пішов (повернувся в гру) */
function createBar() {
  bar = new BrowserWindow({
    width: BAR_W, height: 150, show: false, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, title: 'Q-Hub · плашка',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  bar.setAlwaysOnTop(true, 'screen-saver');
  /* прозорість плашки — CSS-ом у самій плашці (Bar.tsx): setOpacity на Windows робить прозоре вікно чорним прямокутником */
  /* з плашки відкриваються лише теми правил на форумі сервера й запрошення Discord Q-Hub — у звичайному браузері */
  bar.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://forum.quant5.com.ua/') || DISCORD_RE.test(url)) openExternal(url); return { action: 'deny' }; });
  bar.webContents.on('will-navigate', e => e.preventDefault());
  /* повернувся в гру — плашка зникає, якщо її не закріпили шпилькою.
     Але гра (RAGE MP) сама забирає фокус назад приблизно за секунду після появи плашки — тоді це не «повернувся»:
     плашка ще двічі бере фокус собі, а не вийшло — лишається на екрані (сховати — Alt+Q або клік у плашці й Esc) */
  bar.on('blur', () => {
    if (prefs().pinned) return;
    if (Date.now() - barShownAt < 1500) {
      if (barSteals++ < 2) setTimeout(() => { if (bar.isVisible()) { bar.moveTop(); bar.focus(); } }, 60);
      return;
    }
    hideUnlessOurs();
  });
  /* плашку закрили, не вибравши «надіслати» (Esc, повернувся в гру) — знімок без точки не надсилається */
  /* плашку закрили, нічого не вибравши: знайдена точка однаково йде на сайт (без категорії), знімок без точки — ні */
  bar.on('hide', () => {
    if (!pinAsk) return;
    const a = pinAsk; pinAsk = null;
    /* гравцю без категорії й назви нема чого надсилати — пропозиція без них не пройде модерацію */
    if (a.player) pinLog('Alt+F9 гравця — плашку закрито без категорії й назви, не надіслано');
    else if (a.pt) { pinLog('F9 з точкою — плашку закрито, надсилаю без категорії'); sendPin(a.draft, a.jpeg, a.what).catch(e => showPin('Не вдалося зберегти чернетку: ' + (e?.message || e), true)); }
    else pinLog('F9 без точки — не надіслано (плашку закрито)');
  });
  /* нижня смужка сесії живе разом з плашкою */
  bar.on('show', () => { showStrip().catch(() => {}); });
  /* відкрита плашка й набір у ній — програмою користуються, автооновлення почекає (specs/006) */
  bar.on('show', touch);
  bar.webContents.on('before-input-event', touch);
  bar.on('hide', hideStrip);
  bar.on('hide', () => { if (mapFrom === 'bar') mapw?.hide(); });   // і мапа, відкрита з плашки
  bar.loadFile(path.join(__dirname, 'ui', 'bar.html'));
}
/* фокус пішов з плашки чи мапи: перейшов в іншу з них — лишаються, у гру — ховаються (якщо не закріплено) */
function hideUnlessOurs() {
  setTimeout(() => { const f = BrowserWindow.getFocusedWindow(); if (!prefs().pinned && f !== bar && f !== mapw) bar.hide(); }, 80);
}

/* ---------- історія: ліва колонка плашки (Історія в Bar.tsx). Пошуки й питання до ШІ — локально (history.json), записи — з бази ---------- */
const HIST_MAX = 300;
let histItems = null;
const histFile = () => path.join(dir(), 'history.json');
const histLoad = () => { if (!histItems) { try { histItems = JSON.parse(fs.readFileSync(histFile(), 'utf8')); } catch { histItems = []; } } return histItems; };
const histSave = () => { try { fs.writeFileSync(histFile(), JSON.stringify(histItems)); } catch { /* історія не обов'язкова */ } bar?.webContents.send('hist-changed'); };
function histAdd(it) {
  if (!it || !['ai', 'search'].includes(it.kind) || typeof it.q !== 'string' || !it.q.trim()) return;
  const items = histLoad();
  items.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: it.kind, q: it.q.trim().slice(0, 500),
    reply: it.kind === 'ai' && typeof it.reply === 'string' ? it.reply.slice(0, 4000) : '', ts: new Date().toISOString() });
  items.length = Math.min(items.length, HIST_MAX);
  histSave();
}
/* ---------- мапа Q-Hub поверх гри (map.html, specs/014): окрема плашка, як «Історія»; лише перегляд ----------
   Відкрита кнопкою з плашки — живе разом з плашкою; клавішею (Alt+M) — сама: бере фокус, Esc чи клавіша ховають,
   повернувся в гру — ховається. Вікно створюється при першому відкритті, далі лише ховається: швидко й без навантаження */
let mapw = null, mapFrom = 'key', mapShownAt = 0, mapSteals = 0, mapKeyReg = null, mapFocus = null;
function createMap() {
  mapw = new BrowserWindow({
    width: 1200, height: 800, show: false, frame: false, transparent: true, resizable: false, movable: false, hasShadow: false,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, title: 'Q-Hub · мапа',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  mapw.setAlwaysOnTop(true, 'screen-saver');
  guardPage(mapw);   // без масштабу браузера й F5; посилання — у браузер
  mapw.on('blur', () => {
    if (mapFrom === 'bar') { hideUnlessOurs(); return; }
    if (prefs().pinned) return;
    /* RAGE MP забирає фокус ~1 с після показу — як з плашкою (raiseBar), двічі беремо його назад */
    if (Date.now() - mapShownAt < 1500) {
      if (mapSteals++ < 2) setTimeout(() => { if (mapw.isVisible()) { mapw.moveTop(); mapw.focus(); } }, 60);
      return;
    }
    setTimeout(() => { const f = BrowserWindow.getFocusedWindow(); if (f !== mapw && f !== bar) mapw.hide(); }, 80);
  });
  mapw.loadFile(path.join(__dirname, 'ui', 'map.html'));
}
/* під плашкою (mapwin.place); без плашки — по центру екрана з курсором (там гра) */
function placeMap() {
  const b = mapFrom === 'bar' && bar.isVisible() ? bar.getBounds() : null;
  const d = b ? screen.getDisplayMatching(b) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  mapw.setBounds(mapwin.place({ work: d.workArea, bar: b, hist: null }));
}
function showMap(from) {
  if (!mapw) createMap();
  mapFrom = from;
  placeMap();
  mapw.webContents.send('map-shown', { from });
  if (from === 'bar') { mapw.showInactive(); mapw.moveTop(); return; }
  mapShownAt = Date.now(); mapSteals = 0;
  mapw.show(); mapw.moveTop(); mapw.focus();
}
function hideMap() {
  if (!mapw?.isVisible()) return;
  /* з плашки — назад у плашку; клавішею — фокус назад у гру (gamefocus.cjs): сам hide() лишає гру без керування до кліку */
  if (mapFrom === 'bar' && bar.isVisible()) { mapw.hide(); bar.focus(); return; }
  const had = mapw.isFocused();
  mapw.hide();
  if (had) game.giveBack();
}
/* місце з пошуку плашки (FR-007): показати мапу й центрувати на ньому. Щойно створене вікно ще вантажиться —
   тоді воно саме забере точку (map-focus-take), подія до нього не дійде */
function openMapAt(p) {
  mapFocus = { id: typeof p.id === 'string' ? p.id.slice(0, 64) : undefined, x: p.x, y: p.y };
  if (!mapw?.isVisible()) showMap('bar');
  mapw.webContents.send('map-focus', mapFocus);
}
function toggleMap(from) {
  if (mapw?.isVisible()) { hideMap(); return false; }
  showMap(from); return true;
}
/* «Де я?» (specs/014 US3): місце гравця зі знімка великої карти гри — тим самим локатором, що F9. Знімок лише в пам'яті:
   не пишеться на диск і не надсилається (FR-010); у pin.log — лише результат */
async function whereFrom(img) {
  if (!img) return { ok: false, why: 'не вдалося зняти екран' };
  if (shots.isBlack(img.toBitmap())) return { ok: false, why: 'знімок чорний — перемкни гру в режим «вікно без рамки»' };
  await locatorUp();
  let loc;
  try { loc = await locatePin(img); } catch (e) { pinLog('where ' + (e?.stack || e)); loc = { kind: 'error' }; }
  pinLog('where ' + JSON.stringify({ kind: loc.kind, x: loc.x, y: loc.y }));
  return loc.kind === 'point' ? { ok: true, x: loc.x, y: loc.y } : { ok: false, why: WHY[loc.kind] || loc.kind };
}
/* клавіша мапи, коли мапа схована: спершу знімок (поки на екрані гра), потім мапа; у кадрі велика карта гри —
   мапа одразу з «Ти тут» (FR-008a). Немає великої карти — просто мапа */
async function mapKeyPressed() {
  if (mapw?.isVisible()) { hideMap(); return; }
  game.remember();
  const img = await grabClean().catch(() => null);
  const big = !!img && !!mapmatch.scaleBar({ width: img.getSize().width, height: img.getSize().height, data: img.toBitmap() });
  showMap('key');
  if (!big) return;
  mapw.webContents.send('map-where', { state: 'busy' });
  mapw.webContents.send('map-where', await whereFrom(img));
}
function registerMapKey(key) {
  if (mapKeyReg) { globalShortcut.unregister(mapKeyReg); mapKeyReg = null; }
  const ok = globalShortcut.register(key, () => mapKeyPressed().catch(e => pinLog('where ' + (e?.stack || e))));
  if (ok) mapKeyReg = key;
  return ok;
}

/* нижня смужка під плашкою Alt+Q: сесія й чистий прибуток за годину (strip.html, strip.cjs).
   Прозоре вікно на всю ширину екрана, кліки проходять крізь нього в гру, фокус не забирає */
const STRIP_H = 44, STRIP_GAP = 12;
let strip = null, stripTimer = null;
function createStrip() {
  strip = new BrowserWindow({
    width: 800, height: STRIP_H, show: false, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, hasShadow: false, title: 'Q-Hub · сесія',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  strip.setAlwaysOnTop(true, 'screen-saver');
  strip.setIgnoreMouseEvents(true);
  strip.webContents.on('will-navigate', e => e.preventDefault());
  strip.loadFile(path.join(__dirname, 'strip.html'));
}
/* гроші сеансу з балансу HUD: прибуток за годину в смужці (specs/040) і підсумок сеансу в game_sessions для кабінету
   (specs/044) — таймер сесії дописує його в рядок сесії раз на хвилину; окремих зчитувань не зберігаємо */
let sessMoney = null;
const moneyKey = () => (settings.session ? `${settings.session.started}:${settings.character || ''}` : null);
/* пороги з money_rules (0049): без зв'язку — останні прочитані, а ще раніше — типові */
const moneyRules = () => settings.moneyRules || { max_jump: MAX_JUMP, min_minutes: 5 };
async function loadMoneyRules() {
  const { data } = await sb.from('money_rules').select('max_jump, min_minutes').maybeSingle();
  if (data) { settings.moneyRules = data; saveSettings(); }
}
function onMoney(m, at) {
  sessMoney ??= sessionMoney(settings.sessionMoney);
  if (sessMoney.update(moneyKey(), m, at, Number(moneyRules().max_jump) || MAX_JUMP)) { settings.sessionMoney = sessMoney.state(); saveSettings(); }
}
/* підсумок для рядка сесії персонажа characterId; стан зберігаємо разом, щоб перезапуск програми не губив «Заробив» */
function sessionSummary(characterId) {
  const s = settings.session;
  if (!s || !characterId) return null;
  sessMoney ??= sessionMoney(settings.sessionMoney);
  settings.sessionMoney = sessMoney.state();
  return sessMoney.summary(`${s.started}:${characterId}`);
}
/* сесія з таймера гри (settings.session); без гри — порожньо */
function stripData() {
  const s = settings.session;
  if (!s) return { started: null, perHour: null, game: false };
  sessMoney ??= sessionMoney(settings.sessionMoney);
  return { started: s.started, perHour: sessMoney.perHour(moneyKey(), Date.now()), game: true };
}
async function showStrip() {
  if (!strip || prefs().strip === false) return;
  const { bounds: b } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  strip.setBounds({ x: b.x + 16, y: b.y + b.height - STRIP_H - STRIP_GAP, width: b.width - 32, height: STRIP_H });
  if (strip.webContents.isLoading()) await new Promise(r => strip.webContents.once('did-finish-load', r));
  const push = async () => { if (covOn) return; try { await strip.webContents.executeJavaScript(`render(${JSON.stringify(stripData())})`); } catch { /* вікно смужки ще вантажиться — наступна спроба за хвилину */ } };
  await push();
  if (!bar.isVisible()) return;   // плашку вже сховали, поки рахували
  strip.showInactive(); strip.moveTop();
  clearInterval(stripTimer); stripTimer = setInterval(push, 60e3);
}
function hideStrip() { clearInterval(stripTimer); stripTimer = null; if (!covOn) strip?.hide(); }

/* смужка в режимі «скупник» (specs/024, contracts/strip-buyer.md): поки відкрите вікно скупника — «Шкури: прочитано 9 з 32»,
   навіть коли плашка Alt+Q закрита. Програма лише підказує прокрутити — сама нічого в грі не гортає (конституція, I) */
let covOn = false, covTimer = null, buyerNames = null;
async function buyerName(id) {
  if (!buyerNames) { const { data } = await sb.from('buyers').select('id,name'); if (data) buyerNames = new Map(data.map(b => [b.id, b.name])); }
  return buyerNames?.get(id) || id;
}
function endCoverage() {
  clearTimeout(covTimer); covTimer = null;
  if (!covOn) return;
  covOn = false;
  if (bar?.isVisible()) showStrip(); else strip?.hide();
}
async function onCoverage(c) {
  if (!c) return endCoverage();
  if (!c.shown || !strip || prefs().strip === false || prefs().autoPrices === false) return;
  const data = { mode: 'buyer', buyer: await buyerName(c.buyer).catch(() => c.buyer), read: c.read, total: c.total, pending: c.pending };
  if (strip.webContents.isLoading()) await new Promise(r => strip.webContents.once('did-finish-load', r));
  try { await strip.webContents.executeJavaScript(`render(${JSON.stringify(data)})`); } catch { return; }
  if (!covOn) {
    const { bounds: b } = screen.getPrimaryDisplay();   // вікно гри — на основному моніторі (його й знімає captureFrame)
    strip.setBounds({ x: b.x + 16, y: b.y + b.height - STRIP_H - STRIP_GAP, width: b.width - 32, height: STRIP_H });
  }
  covOn = true;
  if (!strip.isVisible()) strip.showInactive();
  strip.moveTop();
  /* кадрів зі скупником немає — вікно закрите; кадр читається до ~25 с, тож чекаємо трохи довше за OPEN_GAP (pricescan.cjs) */
  clearTimeout(covTimer); covTimer = setTimeout(endCoverage, 35e3);
}

/* де з'являється плашка: зверху, по центру чи внизу екрана, на якому зараз курсор (унизу — над смужкою сесії) */
function placeBar() {
  const { workArea: a } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const y = { top: a.y + 24, center: a.y + Math.round(a.height * 0.22), bottom: a.y + a.height - bar.getSize()[1] - 24 - (prefs().strip === false ? 0 : STRIP_H + STRIP_GAP) }[prefs().position];
  bar.setPosition(Math.round(a.x + (a.width - bar.getSize()[0]) / 2), Math.max(a.y, y));
}
/* показати плашку поверх гри й узяти фокус (blur вище не дає грі одразу сховати її) */
let barShownAt = 0, barSteals = 0;
function raiseBar() {
  barShownAt = Date.now(); barSteals = 0;
  bar.show(); bar.moveTop(); bar.focus();
}
/* гравець сам ховає плашку (Esc, клавіша) — фокус назад у гру; пішов в інше вікно сам — не чіпаємо */
const game = gameFocus({ ours: () => BrowserWindow.getAllWindows().map(w => hwndOf(w.getNativeWindowHandle())) });
function hideBarToGame() {
  const had = bar.isFocused() || !!mapw?.isFocused();
  bar.hide();
  if (had) game.giveBack();
}
async function toggleBar() {
  if (bar.isVisible()) { hideBarToGame(); return; }
  await showBar();
}
/* свіжі правила й закони — при запуску, кожні 6 год і при відкритті плашки, але не частіше разу на 5 хв (304 без змін —
   кілька сотень байт): нове джерело адміна видно в пошуку за хвилини, а не за 6 год. Змінились — плашка перечитає
   (specs/010 FR-017, SC-005) */
let rulesAt = 0;
function pullRules(force = false) {
  if (!force && Date.now() - rulesAt < 5 * 60e3) return;
  rulesAt = Date.now();
  rulesSnap().refresh().then(ch => { if (ch) bar?.webContents.send('rules-changed'); }).catch(() => {});
}
async function showBar() {
  const { data: { session } } = await sb.auth.getSession();
  if (session && hasNick === null) await state().catch(() => {});   // після запуску ще не знаємо, чи вибрано нік
  if (!session || !settings.character || hasNick === false) { showLogin(); return; }   // спершу вхід, нік і персонаж
  placeBar();
  raiseBar();
  bar.webContents.send('quick-show');
  pullRules();
}

/* підказка іконки: гра йде чи клавіша плашки */
function trayTip() {
  tray?.setToolTip(settings.session ? 'Q-Hub — гра йде, сесія рахується' : `Q-Hub — ${prefs().hotkey}: пошук і ціни`);
}
function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  trayTip();
  trayMenu();
  tray.on('click', showMain);
}
/* меню трею; є нова версія — зверху пункт «Оновити» */
function trayMenu() {
  const u = updates?.state();
  tray?.setContextMenu(Menu.buildFromTemplate([
    ...(u && u.status !== 'idle' ? [{ label: u.status === 'downloading' ? `Оновлення ${u.percent}%…` : `Оновити до ${u.version}`, enabled: u.status !== 'downloading', click: () => updates.install() }, { type: 'separator' }] : []),
    { label: 'Плашка Alt+Q', click: () => toggleBar() },
    { label: 'Відкрити Q-Hub', click: showMain },
    { type: 'separator' },
    ...(app.isPackaged ? [{ label: 'Запускати разом з Windows', type: 'checkbox', checked: autostart(), click: mi => {
      if (!setAutostart(mi.checked)) tray?.displayBalloon?.({ title: 'Q-Hub', content: AUTOSTART_ERR });
      trayMenu();
    } }, { type: 'separator' }] : []),
    /* з автооновленням завантажена версія ставиться при виході (без перезапуску) */
    { label: 'Вийти з програми', click: () => { quitting = true; if (!(autoUpdate() && updates?.installNow({ restart: false }))) app.quit(); } },
  ]));
}

/* ---------- оновлення програми (updater.cjs, specs/006): перевірка кожні 30 хв; з автооновленням — завантаження у фоні
   й встановлення після 10 хв простою або при виході, без нього — після кнопки «Оновити» ---------- */
let updates = null, notifiedVersion = null;
const autoUpdate = () => prefs().autoUpdate !== false;
/* простій — коли востаннє гравець відкривав плашку, кабінет чи щось у них вводив */
let lastActive = Date.now();
const touch = () => { lastActive = Date.now(); };
const programBusy = () => [bar, gate].some(w => w && !w.isDestroyed() && w.isVisible());
const installMark = () => path.join(dir(), 'installing.json');   // «ставиться оновлення» — див. installPending в updater.cjs
function startUpdates() {
  if (!app.isPackaged) return;   // з npm start оновлювати нічого: це не встановлена програма
  const { autoUpdater } = require('electron-updater');
  const log = m => { try { fs.appendFileSync(path.join(dir(), 'update.log'), `${new Date().toISOString()} ${m}\n`); } catch { /* журнал не обов'язковий */ } };
  /* завантаження й розпакування — на диску програми (updateDirs), не на C:; теку не створити — лишаються звичайні шляхи */
  const ud = updateDirs(app.getPath('exe'));
  let ownDirs = false;
  try { fs.mkdirSync(ud.cache, { recursive: true }); fs.mkdirSync(ud.temp, { recursive: true }); ownDirs = true; } catch (e) { log('update dirs ' + (e?.message || e)); }
  if (ownDirs) {
    Object.defineProperty(autoUpdater.app, 'baseCachePath', { get: () => ud.cache });
    /* старий кеш на C: (~220 МБ) більше не потрібен */
    if (process.env.LOCALAPPDATA) fs.rm(path.join(process.env.LOCALAPPDATA, 'q-hub-desktop-updater'), { recursive: true, force: true }, () => {});
  }
  updates = createUpdater({
    autoUpdater,
    beforeInstall: () => {
      quitting = true;
      try { fs.writeFileSync(installMark(), JSON.stringify({ from: app.getVersion(), at: Date.now() })); } catch { /* без позначки — як раніше */ }
      /* інсталятор бере %TEMP% від програми, яка його запускає — і розпаковує туди ~400 МБ */
      if (ownDirs) process.env.TEMP = process.env.TMP = ud.temp;
    },
    log,
    auto: autoUpdate,
    onChange: s => {
      bar?.webContents.send('update', { ...s, auto: autoUpdate() });
      trayMenu();
      /* сповіщення Windows — один раз на кожну нову версію; з автооновленням не треба: поставиться само */
      if (s.status === 'available' && !autoUpdate() && s.version !== notifiedVersion) {
        notifiedVersion = s.version;
        notify({ title: 'Вийшла нова версія Q-Hub', body: `${s.version} — натисни «Оновити» в програмі або в меню іконки в треї.` }, showMain);
      }
    },
  });
  setTimeout(() => updates.check(), 15e3);
  setInterval(() => updates.check(), 30 * 60e3);   // нова версія доходить за пів години, а не за три
  /* завантажене ставиться саме, коли програмою 10 хв не користуються */
  setInterval(() => {
    if (programBusy()) touch();
    if (installDue({ status: updates.state().status, auto: autoUpdate(), idleMs: Date.now() - lastActive, busy: programBusy(), failAt: settings.updateFailAt, now: Date.now() })) {
      log('auto install after idle'); updates.installNow();
    }
  }, 60e3);
}

/* Shift+Enter: спитати помічника (supabase/functions/assistant); rules — пункти правил сервера, які плашка знайшла під питання.
   Помічник лише відповідає: облік програма більше не веде (specs/040), тож дій-записів немає */
async function quickAsk(text, rules) {
  const { data, error } = await sb.functions.invoke('assistant', { body: { text: String(text).slice(0, 500), character_id: settings.character, rules: typeof rules === 'string' ? rules.slice(0, 8000) : '' } });
  if (error) {
    const msg = await error.context?.json?.().then(b => b.error).catch(() => null);
    return { error: msg || 'Помічник недоступний. Перевір інтернет і спробуй ще раз.' };
  }
  return { reply: String(data.reply || ''), actions: [] };
}
/* ---------- плашка Alt+Q: дані, персонаж, історія, налаштування ---------- */
const BAR_DEFAULTS = { pinned: false, position: 'top', opacity: 1, hotkey: 'Alt+Q', mode: 'ai', tab: true, autoPrices: true, shareShots: true, pinKey: 'Alt+F9', autoUpdate: true, mapKey: 'Alt+M', sellAlert: true, eventAlert: false, eventIds: ['ufo'] };   // F9 без модифікатора гра (RAGE MP) забирає собі — до програми не доходить
const prefs = () => ({ ...BAR_DEFAULTS, ...settings.bar });
/* «Запускати разом з Windows» — стан бере сама Windows; з npm start (не встановлена програма) — завжди вимкнено */
/* автозапуск з Windows (specs/009): запис «Q-Hub» у реєстрі з аргументом --autostart — так видно, що програму запустила
   Windows, і вона стартує тихо, лише іконкою в треї. Ім'я — назва програми («Q-Hub»), як ${PRODUCT_NAME} в інсталяторі, що
   прибирає запис при видаленні (build/installer.nsh); тестова збірка «Q-Hub Test» так не чіпає запис справжньої */
const LOGIN = { name: app.getName(), args: ['--autostart'] };
const autostarted = process.argv.includes('--autostart');
const autostart = () => app.isPackaged && app.getLoginItemSettings(LOGIN).openAtLogin;
/* увімкнути чи вимкнути; false — Windows не дала змінити. Старий запис 0.3.x (ім'я за замовчуванням, без аргументу) прибираємо завжди */
function setAutostart(on) {
  try {
    app.setLoginItemSettings({ ...LOGIN, openAtLogin: on, path: process.execPath });
    app.setLoginItemSettings({ openAtLogin: false });
  } catch { /* перевірка нижче скаже, що не вийшло */ }
  return autostart() === on;
}
/* ярлик на робочому столі: інсталятор «в один клік» ставить його сам, а прибрати чи повернути — тут (екран входу) */
const deskLink = () => path.join(app.getPath('desktop'), 'Q-Hub.lnk');
const hasDeskLink = () => app.isPackaged && fs.existsSync(deskLink());
function setDeskLink(on) {
  try {
    if (on) shell.writeShortcutLink(deskLink(), 'create', { target: process.execPath, appUserModelId: APP_ID, description: 'Q-Hub' });
    else fs.rmSync(deskLink(), { force: true });
  } catch { /* перевірка нижче скаже, що не вийшло */ }
  return hasDeskLink() === on;
}
const AUTOSTART_ERR = 'Windows не дала змінити автозапуск. Перевір «Диспетчер завдань → Автозавантаження»: там Q-Hub можна ввімкнути чи вимкнути вручну.';

/* ціни скупників — раз на 5 хвилин, а не на кожне відкриття плашки */
let pricesAt = 0, pricesCache = [];
/* fresh — перевірка «час здавати» (specs/075): їй потрібні ціни зараз, а не до 5 хв тому */
async function barPrices(fresh = false) {
  if (!fresh && Date.now() - pricesAt < 5 * 60e3 && pricesCache.length) return pricesCache;
  const [{ data, error }, pend] = await Promise.all([
    sb.from('buyer_items').select('item_id,price,min_price,max_price,price_at,buyers(id,name,image_url),items(name,unit,image_url,sub)'),
    /* ціни, що чекають другого гравця (specs/029) — доповнення: без них плашка однаково показує поточні */
    sb.from('price_pending').select('buyer_id,item_id,price,votes,need').then(r => r.data || [], () => []),
  ]);
  if (error) return pricesCache;
  const top = new Map();
  for (const p of pend) { const k = p.buyer_id + ':' + p.item_id; if (!top.has(k) || top.get(k).votes < p.votes) top.set(k, { price: Number(p.price), votes: p.votes, need: p.need }); }
  pricesCache = (data || []).filter(r => r.buyers && r.items).map(r => ({
    pend: top.get(r.buyers.id + ':' + r.item_id),
    buyerId: r.buyers.id, itemId: r.item_id,
    item: r.items.name, unit: r.items.unit || 'шт', icon: r.items.image_url || '', sub: r.items.sub || '', buyer: r.buyers.name, buyerIcon: r.buyers.image_url || '',
    price: Number(r.price) || 0, min: Number(r.min_price) || 0, max: Number(r.max_price) || 0, at: r.price_at,
  }));
  pricesAt = Date.now();
  return pricesCache;
}
/* Discord Q-Hub (specs/037): посилання задає адмін на сайті (public.site_links); останнє відоме лежить у settings,
   щоб без інтернету налаштування однаково показували кнопку. Перевірка та сама, що в src/lib/brand.ts і 0045 */
const DISCORD_RE = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,64}\/?$/;
async function siteDiscord() {
  try {
    const { data, error } = await sb.from('site_links').select('discord_url').maybeSingle();
    if (!error) {
      const u = data && DISCORD_RE.test(data.discord_url) ? data.discord_url : '';
      if (u !== (settings.discord || '')) { settings.discord = u; saveSettings(); }
    }
  } catch { /* немає зв'язку — лишаємо збережене */ }
  return settings.discord || '';
}
async function barData() {
  const s = await state();
  if (!s.user) return { user: null };
  const [prices, discord] = await Promise.all([barPrices(), siteDiscord()]);
  return { ...s, prices, prefs: { ...prefs(), autostart: autostart() }, staff: STAFF.includes(myRole), version: app.getVersion(), discord,
    watch: watch(), market: marketOf(s.character) };
}
/* зміна персонажа з плашки — кабінет перемикається разом із нею */
async function barCharacter(id) {
  if (typeof id !== 'string') return false;
  settings.character = id; saveSettings();
  bar?.webContents.send('session', await tokens());
  return true;
}
/* знімок екрана, на якому зараз курсор (там гра), у повному розмірі; плашка не має потрапити в кадр */
async function grabScreen() {
  if (bar.isVisible()) { bar.hide(); await new Promise(r => setTimeout(r, 200)); }
  return captureScreen();
}
/* «Де я?» (specs/014 FR-008a): вікна програми на мить стають прозорими — у кадр не потрапляють, але не ховаються й фокус лишається */
async function grabClean() {
  const ws = [bar, mapw, strip].filter(w => w?.isVisible());
  for (const w of ws) w.setOpacity(0);
  if (ws.length) await new Promise(r => setTimeout(r, 150));
  try { return await captureScreen(); } finally { for (const w of ws) w.setOpacity(1); }
}
async function captureScreen() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = srcs.find(s => s.display_id === String(d.id)) || srcs[0];
  return !src || src.thumbnail.isEmpty() ? null : src.thumbnail;
}

/* ---------- мітка з гри (F9): знімок великої карти → чернетка на сайт, публікує адмін (specs/001-map-pin-drafts) ----------
   Поки без розпізнавання карти: чернетка йде як «точку не визначено», точку ставить адмін, дивлячись на знімок.
   Клавіша — для всіх, хто увійшов: editor / moderator / admin шлють чернетку адміну (map_drafts), звичайний гравець —
   пропозицію мітки в довідник (wiki_proposals, розділ map_point, specs/043 US5): категорія й назва обов'язкові,
   знімок — приватний доказ для модератора, публікують admin і moderator. */
const STAFF = ['editor', 'moderator', 'admin'];
let myRole = null, pinKeyReg = null, pinAt = 0, drafts = null, pinTimer = null;
async function refreshRole() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) myRole = null;
  else {
    const { data, error } = await sb.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    if (error) return;   // немає мережі — лишаємо, як було
    myRole = data?.role || 'user';
  }
  registerPinKey(prefs().pinKey);
}

/* де гравець на великій карті: mapmatch.cjs в окремому потоці; еталон — з сайту (mapref.cjs). Кожна спроба — у pin.log */
const unpacked = p => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');   // потоки й tesseract читають з диска, не з архіву
const pinLog = m => { try { fs.appendFileSync(path.join(dir(), 'pin.log'), `${new Date().toISOString()} ${m}\n`); } catch { /* журнал не обов'язковий */ } };
let locator = null, locatorReady = false, scaleOcr = null, lid = 0, locatorInit = null;
/* локатор потрібен редакторам (F9) і будь-кому для «Де я?» на мапі (specs/014 FR-009) — запускається за першої потреби.
   Еталон із кешем масштабів займає ~85 МБ, а F9 і «Де я?» тиснуть рідко: після LOCATOR_IDLE без них потік і OCR шкали
   закриваються, наступне натискання запускає їх знову (~1–2 с довше) */
const LOCATOR_IDLE = 10 * 60e3;
let locatorIdle = null;
const locatorUp = () => (locatorInit ??= startLocator());
function stopLocator() {
  locator?.terminate(); scaleOcr?.terminate().catch(() => {});
  locator = null; locatorReady = false; locatorInit = null; scaleOcr = null;
  for (const f of pending.values()) f({ error: 'stopped' });
  pending.clear();
  pinLog('locator stopped (idle)');
}
const locatorUsed = () => { clearTimeout(locatorIdle); locatorIdle = setTimeout(stopLocator, LOCATOR_IDLE); };
const pending = new Map();
function callLocator(msg, transfer = [], ms = 6000) {
  return new Promise(res => {
    const id = ++lid, t = setTimeout(() => { pending.delete(id); res({ error: 'timeout' }); }, ms);
    pending.set(id, r => { clearTimeout(t); res(r); });
    locator.postMessage({ ...msg, id }, transfer);
  });
}
async function startLocator() {
  if (locator) return;
  locator = new Worker(unpacked(path.join(__dirname, 'mapmatch.worker.cjs')));
  locator.on('message', r => { const f = pending.get(r.id); if (f) { pending.delete(r.id); f(r); } });
  locator.on('error', e => { pinLog('locator error ' + (e?.stack || e)); locator = null; locatorReady = false; locatorInit = null; });
  try {
    const { bin, meta } = await loadMapRef(cfg.site, path.join(dir(), 'map'));
    const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length);
    const r = await callLocator({ type: 'init', bin: ab, meta }, [ab], 30000);
    locatorReady = !!r.ok; pinLog('locator ready ' + JSON.stringify(r));
  } catch (e) { pinLog('locator init ' + (e?.message || e)); }
}
/* число на шкалі («551m») — цифровий OCR ділянки під правим кінцем шкали, збільшеної втричі */
async function readScale(img, bar) {
  if (!scaleOcr) {
    scaleOcr = await createWorker('eng', 1, { langPath: unpacked(path.join(__dirname, 'ocr')), gzip: false, cacheMethod: 'none' });
    /* «m / km» або «ft / mi» — залежно від одиниць у налаштуваннях гри */
    await scaleOcr.setParameters({ tessedit_char_whitelist: '0123456789mkfti.,', tessedit_pageseg_mode: '7' });
  }
  const part = img.crop(bar.number), { width } = part.getSize();
  const text = (await scaleOcr.recognize(part.resize({ width: width * 3, quality: 'best' }).toPNG())).data.text.trim();
  return { text, meters: mapmatch.scaleMeters(text) };
}
const WHY = { no_map: 'не видно шкали великої карти', zoom_in: 'карта надто віддалена — наблизьте до 50–1500 м',
  zoom_out: 'карта надто наближена — віддаліть до 50–1500 м', unsure: 'не впевнений у місці', no_ref: 'мапа ще завантажується', error: 'помилка розпізнавання' };
async function locatePin(img) {
  locatorUsed();
  if (!locator || !locatorReady) return { kind: 'no_ref' };
  const bmp = img.toBitmap(), { width, height } = img.getSize(), frame = { width, height, data: bmp };
  const bar = mapmatch.scaleBar(frame);
  if (!bar) return { kind: 'no_map' };
  const sc = await readScale(img, bar);
  if (!sc.meters) return { kind: 'no_map', scale_text: sc.text };
  const ab = bmp.buffer.slice(bmp.byteOffset, bmp.byteOffset + bmp.length);
  const r = await callLocator({ type: 'locate', width, height, data: ab, meters: sc.meters }, [ab]);
  if (r.error) { pinLog('locate ' + r.error); return { kind: 'error' }; }
  return { ...r.result, scale_text: sc.text, bar_px: bar.px };
}
/* чи вдалося зайняти клавішу — у pin.log лише коли змінилось (refreshRole перереєстровує її раз на 10 хв);
   не вдалося — один раз сказати в треї: інакше F9 «просто не працює» без жодного сліду */
let pinKeyState = '';
function registerPinKey(key) {
  if (pinKeyReg) { globalShortcut.unregister(pinKeyReg); pinKeyReg = null; }
  if (!myRole) return true;   // без входу клавішу не займаємо — нікуди надсилати
  const ok = globalShortcut.register(key, () => { pinLog(`${key} натиснуто`); pinShot().catch(e => showPin('Не вдалося зберегти чернетку: ' + (e?.message || e), true)); });
  if (ok) pinKeyReg = key;
  const st = `${key}:${ok}`;
  if (st !== pinKeyState) {
    pinKeyState = st;
    pinLog(ok ? `клавішу ${key} зайнято` : `клавішу ${key} зайняти не вдалося — її тримає інша програма`);
    if (!ok) tray?.displayBalloon?.({ title: 'Q-Hub', content: `${key} зайнята іншою програмою — мітки з гри не працюють. Зміни клавішу в налаштуваннях плашки → Зір програми.` });
  }
  return ok;
}
/* повідомлення поверх гри без фокусу (гра не втрачає керування) — і само ховається */
function showPin(text, bad = false) {
  clearTimeout(pinTimer);
  bar.webContents.send('pin', { text, bad });
  if (!bar.isVisible()) { placeBar(); bar.showInactive(); }
  bar.moveTop();
  /* результат F9 ховається сам (фокус повертається грі), якщо плашку не закріпили і не чекаємо відповіді у формі */
  pinTimer = setTimeout(() => { if (bar.isVisible() && !pinAsk && !prefs().pinned) bar.hide(); }, 2500);
}
const draftBox = () => (drafts ??= outbox(path.join(dir(), 'drafts'), sendDraft));
async function pinShot() {
  if (Date.now() - pinAt < 5000) return;   // подвійне натискання — одна чернетка
  pinAt = Date.now();
  const img = await grabScreen();
  if (!img) return showPin('Не вдалося зняти екран — спробуйте ще раз.', true);
  if (shots.isBlack(img.toBitmap())) return showPin('Знімок вийшов чорним — перемкніть гру в режим «вікно без рамки».', true);
  const { width, height } = img.getSize();
  try { fs.writeFileSync(path.join(dir(), 'pin-last.png'), img.toPNG()); } catch { /* лише для діагностики, лишається на ПК */ }
  /* плашка — одразу, поки Windows ще дозволяє взяти фокус (лише відразу після натискання клавіші);
     якщо точку не знайдемо, форма відкриється вже з фокусом і можна одразу друкувати */
  clearTimeout(pinTimer);
  placeBar(); raiseBar();
  bar.webContents.send('pin', { text: 'Шукаю точку на карті…' });
  await locatorUp();
  let loc;
  try { loc = await locatePin(img); } catch (e) { pinLog('locate ' + (e?.stack || e)); loc = { kind: 'error' }; }
  pinLog('F9 ' + JSON.stringify(loc));
  const pt = loc.kind === 'point';
  const player = !STAFF.includes(myRole);
  /* гравцю без точки нема чого надсилати: модератор не ставить точку за знімком — підказати, як інакше */
  if (player && !pt) return showPin(`Точку не знайдено: ${WHY[loc.kind] || loc.kind}. Відкрий велику карту й віддали її, або постав мітку на мапі програми — ${prefs().mapKey || 'Alt+M'}.`, true);
  const { kind, match = {}, ms, scale_text, bar_px, meters } = loc;
  const draft = { taken_at: new Date().toISOString(), x: pt ? loc.x : null, y: pt ? loc.y : null,
    match: { ...match, kind, ms, scale_text, bar_px, meters, screen: [width, height], version: app.getVersion() } };
  /* і з точкою, і без — спершу форма з категорією й описом (підказка адміну). Точку знайдено: Enter — надіслати з категорією,
     закрив плашку — надсилається без категорії. Не знайдено: на знімку може бути не гра (чат, Discord) — без «так» не надсилаємо */
  const what = pt ? `Точка під хрестиком: X ${Math.round(loc.x)} · Y ${Math.round(loc.y)}` : 'Без точки — поставить адмін';
  pinAsk = { draft, jpeg: img.toJPEG(80), pt, what, player };
  clearTimeout(pinTimer);
  placeBar(); raiseBar();
  bar.webContents.send('pin-ask', { reason: pt ? '' : WHY[kind] || kind, preview: img.resize({ width: 480 }).toDataURL(), cats: await pinCats(), point: pt ? { x: Math.round(loc.x), y: Math.round(loc.y) } : null, player });
}
/* категорії мапи для вікна «точку не знайдено» — раз на 30 хв */
let catsAt = 0, catsCache = [];
async function pinCats() {
  if (Date.now() - catsAt < 30 * 60e3 && catsCache.length) return catsCache;
  const { data, error } = await sb.from('map_categories').select('id,name,grp,sort').order('sort');
  if (!error) { catsCache = data || []; catsAt = Date.now(); }
  return catsCache;
}
let pinAsk = null;   // знімок без точки, що чекає на рішення: Enter — надіслати, Esc чи закрита плашка — ні
async function sendPin(draft, jpeg, what) {
  draftBox().put(draft, jpeg);
  denyText = '';
  const r = await draftBox().flush();
  const sent = draft.kind === 'proposal' ? 'Мітку надіслано на розгляд — статус на сайті: «Кабінет» → «Мої правки».' : 'Чернетку надіслано.';
  if (r.denied) showPin(denyText || 'Немає прав на чернетки міток.', true);
  else if (r.left) showPin(what + '. Відправлю, щойно буде інтернет.');
  else showPin(what + '. ' + sent);
}
let denyText = '';   // чому база відхилила пропозицію гравця (заборона, ліміт) — показати замість загального тексту
/* hint — підказка редактора адміну: { category, note } */
function pinDecide(send, hint = {}) {
  const a = pinAsk; pinAsk = null;
  if (!a) return;
  const category_id = typeof hint.category === 'string' && hint.category ? hint.category : null;
  const note = typeof hint.note === 'string' ? hint.note.trim().slice(0, 600) : '';
  const name = typeof hint.name === 'string' ? hint.name.trim().slice(0, 160) : '';
  if (!send) return showPin('Не надіслано.');
  if (a.player) {
    if (!category_id || !name || !a.pt) return showPin('Потрібні категорія й назва — мітку не надіслано.', true);
    return sendPin({ ...a.draft, kind: 'proposal', category_id, name, note }, a.jpeg, a.what).catch(e => showPin('Не вдалося надіслати мітку: ' + (e?.message || e), true));
  }
  sendPin({ ...a.draft, category_id, note }, a.jpeg, a.what).catch(e => showPin('Не вдалося зберегти чернетку: ' + (e?.message || e), true));
}
/* знімок у закрите сховище, потім рядок; повтор (файл чи рядок уже є) — це успіх, а не помилка */
async function sendDraft(draft, jpeg) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return 'retry';
  if (draft.kind === 'proposal') return sendProposal(session, draft, jpeg);
  const shot = `${session.user.id}/${draft.id}.jpg`;
  const up = await sb.storage.from('map-drafts').upload(shot, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (up.error) {
    const m = `${up.error.statusCode || ''} ${up.error.message}`;
    if (!/409|exists|duplicate/i.test(m)) return /403|row-level|security|unauthori/i.test(m) ? 'denied' : 'retry';
  }
  const row = { id: draft.id, taken_at: draft.taken_at, shot, x: draft.x, y: draft.y, match: draft.match || {} };
  const hint = draft.category_id || draft.note ? { category_id: draft.category_id || null, note: draft.note || '' } : {};
  let { error } = await sb.from('map_drafts').insert({ ...row, ...hint });
  /* у базі ще немає колонок підказки (0020) або категорію видалили — надіслати без підказки, а не застрягти в черзі */
  if (error && Object.keys(hint).length && /category_id|note|column|foreign key|23503|PGRST204/i.test(`${error.code} ${error.message}`))
    ({ error } = await sb.from('map_drafts').insert(row));
  if (!error || error.code === '23505') return 'ok';
  return error.code === '42501' ? 'denied' : 'retry';
}
/* пропозиція мітки від гравця (0059): знімок — приватний доказ у wiki-proof (своя тека), рядок — wiki_proposals з тим самим id,
   тож повторна відправка з черги не дає дубля. Заборона, ліміт чи неправильні дані (QH0xx) — не повторювати, а сказати чому */
async function sendProposal(session, draft, jpeg) {
  const proof = `${session.user.id}/${draft.id}.jpg`;
  const up = await sb.storage.from('wiki-proof').upload(proof, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (up.error && !/409|exists|duplicate/i.test(`${up.error.statusCode || ''} ${up.error.message}`)) {
    if (/403|row-level|security|unauthori/i.test(`${up.error.statusCode || ''} ${up.error.message}`)) { denyText = 'Немає прав надсилати мітки — увійди в програму наново.'; return 'denied'; }
    return 'retry';
  }
  const { error } = await sb.from('wiki_proposals').insert({
    id: draft.id, section: 'map_point', kind: 'new', source: 'game', source_note: 'Alt+F9 з програми', proof_path: proof,
    data: { category_id: draft.category_id, name: draft.name, note: draft.note || '', x: Math.round(draft.x), y: Math.round(draft.y) },
  });
  if (!error || error.code === '23505') return 'ok';
  if (/^QH0\d\d$/.test(error.code || '')) { denyText = error.message; sb.storage.from('wiki-proof').remove([proof]).catch(() => {}); return 'denied'; }
  if (error.code === '42501' || error.code === '23514') { denyText = 'Мітки від гравців ще не ввімкнено на сайті.'; return 'denied'; }
  return 'retry';
}

/* «онлайн програми» в шапці сайту: раз на хвилину «я тут» (supabase/migrations/0023).
   Без входу або на старій базі без функції — тихо нічого: лічильник не варто того, щоб заважати */
function startOnline() {
  const ping = async () => { const { data: { session } } = await sb.auth.getSession(); if (session) await sb.rpc('app_ping', { p_version: app.getVersion() }); };   // версія — для адмін-панелі (specs/039)
  ping().catch(() => {}); setInterval(() => ping().catch(() => {}), 60e3);
}
function startDrafts() {
  refreshRole().catch(() => {});
  setInterval(() => refreshRole().catch(() => {}), 10 * 60e3);
  setInterval(() => { if (draftBox().size()) draftBox().flush().catch(() => {}); }, 30e3);
}

/* Alt+S: навчальний знімок екрана гри → плашка з прев'ю й кнопками «що на ньому» (shots.cjs) */
let shotStore = null;
async function captureShot() {
  shotStore ??= shots.store(path.join(dir(), 'shots'));
  const img = await grabScreen();
  if (!img) return;
  const name = shotStore.save(img.toPNG());
  placeBar(); raiseBar();
  bar.webContents.send('shot', { name, preview: img.resize({ width: 520 }).toDataURL(), black: shots.isBlack(img.toBitmap()), stats: shotStore.stats() });
}

/* «Поділитися з розробниками»: знімок (JPEG) і позначка — у закрите сховище training/<id гравця>/… (міграція 0018);
   бачить їх лише адмін. Не вдалося (немає мережі, ліміт) — знімок усе одно лишається локально */
async function shareShot(name, label, note) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return false;
    const img = nativeImage.createFromPath(path.join(shotStore.dir, name + '.png'));
    if (img.isEmpty()) return false;
    const base = `${session.user.id}/${label}/${name}`;
    const up = await sb.storage.from('training').upload(base + '.jpg', img.toJPEG(78), { contentType: 'image/jpeg' });
    if (up.error) return false;
    await sb.storage.from('training').upload(base + '.json', Buffer.from(JSON.stringify({ label, note, size: img.getSize(), version: app.getVersion(), at: new Date().toISOString() })), { contentType: 'application/json' });
    return true;
  } catch { return false; }
}

/* клавіша плашки — своя, клавіша знімка (Alt+S) живе окремо */
let barKey = null;
function registerHotkey(key) {
  if (barKey) globalShortcut.unregister(barKey);
  const ok = globalShortcut.register(key, () => { if (!bar.isVisible()) game.remember(); toggleBar(); });
  barKey = ok ? key : null;
  return ok;
}
/* поле запису клавіші в Налаштуваннях: поки воно чекає, наші глобальні клавіші вимкнено — інакше Alt+Q сховав би
   плашку, а не записався (і не дійшов до перевірки «клавіша вже зайнята»). Поле не відпустило за 20 с — вмикаємо самі */
let keysPaused = null;
function pauseKeys(on) {
  clearTimeout(keysPaused); keysPaused = null;
  if (on) {
    for (const k of [barKey, mapKeyReg, pinKeyReg, SHOT_KEY]) if (k) globalShortcut.unregister(k);
    keysPaused = setTimeout(() => pauseKeys(false), 20e3);
    return;
  }
  const p = prefs();
  registerHotkey(p.hotkey); registerMapKey(p.mapKey); registerPinKey(p.pinKey);
  if (!globalShortcut.isRegistered(SHOT_KEY)) globalShortcut.register(SHOT_KEY, () => captureShot().catch(() => {}));
}
function barPrefs(p) {
  const cur = prefs(), next = { ...cur };
  if (typeof p?.pinned === 'boolean') next.pinned = p.pinned;
  if (['top', 'center', 'bottom'].includes(p?.position)) next.position = p.position;
  if (Number.isFinite(p?.opacity)) next.opacity = Math.min(1, Math.max(0.6, p.opacity));
  if (['ai', 'prices'].includes(p?.mode)) next.mode = p.mode;
  if (typeof p?.tab === 'boolean') next.tab = p.tab;
  if (typeof p?.autoPrices === 'boolean') next.autoPrices = p.autoPrices;
  if (typeof p?.shareShots === 'boolean') next.shareShots = p.shareShots;
  if (typeof p?.autoUpdate === 'boolean') next.autoUpdate = p.autoUpdate;
  /* сповіщення (specs/075, 076): вимикачі й вибрані івенти — лише відомі з розкладу */
  if (typeof p?.sellAlert === 'boolean') next.sellAlert = p.sellAlert;
  if (typeof p?.eventAlert === 'boolean') next.eventAlert = p.eventAlert;
  if (Array.isArray(p?.eventIds)) next.eventIds = alerts.eventIds(p.eventIds);
  if (typeof p?.autostart === 'boolean') {
    if (!app.isPackaged) return { error: 'Автозапуск вмикається лише у встановленій програмі', prefs: { ...cur, autostart: false } };
    if (!setAutostart(p.autostart)) return { error: AUTOSTART_ERR, prefs: { ...cur, autostart: autostart() } };
    trayMenu();
  }
  if (typeof p?.mapKey === 'string' && p.mapKey !== cur.mapKey) {
    const bad = mapwin.mapKeyConflict(p.mapKey, { hotkey: cur.hotkey, pinKey: cur.pinKey, shotKey: SHOT_KEY });
    if (bad) return { error: bad, prefs: cur };
    let ok = false;
    try { ok = registerMapKey(p.mapKey); } catch { ok = false; }
    if (!ok) { registerMapKey(cur.mapKey); return { error: `${p.mapKey} не вийшло зайняти — вона вже в іншої програми або недопустима`, prefs: cur }; }
    next.mapKey = p.mapKey;
  }
  if (typeof p?.pinKey === 'string' && p.pinKey !== cur.pinKey) {
    if (p.pinKey.toLowerCase() === String(cur.mapKey).toLowerCase()) return { error: `${p.pinKey} уже відкриває мапу — оберіть іншу клавішу.`, prefs: cur };
    const bad = pinKeyConflict(p.pinKey, cur.hotkey, SHOT_KEY);
    if (bad) return { error: bad, prefs: cur };
    let ok = false;
    try { ok = registerPinKey(p.pinKey); } catch { ok = false; }
    if (!ok) { registerPinKey(cur.pinKey); return { error: `${p.pinKey} не вийшло зайняти — вона вже в іншої програми або недопустима`, prefs: cur }; }
    next.pinKey = p.pinKey;
  }
  if (typeof p?.hotkey === 'string' && p.hotkey !== cur.hotkey) {
    if (p.hotkey.toLowerCase() === String(cur.pinKey).toLowerCase()) return { error: `${p.hotkey} уже ставить мітку — оберіть іншу клавішу.`, prefs: cur };
    if (p.hotkey.toLowerCase() === String(cur.mapKey).toLowerCase()) return { error: `${p.hotkey} уже відкриває мапу — оберіть іншу клавішу.`, prefs: cur };
    let ok = false;
    try { ok = registerHotkey(p.hotkey); } catch { ok = false; }
    if (!ok) { registerHotkey(cur.hotkey); return { error: `${p.hotkey} не вийшло зайняти — вона вже в іншої програми або недопустима`, prefs: cur }; }
    next.hotkey = p.hotkey;
    tray?.setToolTip(`Q-Hub — ${next.hotkey}: пошук і ціни`);
  }
  settings.bar = next; saveSettings();
  return { prefs: { ...next, autostart: autostart() } };
}

/* ---------- «зір» програми (vision.cjs): гроші з HUD → прибуток за годину (лише показ), вікна скупників → ціни на сайт ---------- */
const visionLog = () => path.join(dir(), 'vision.log');
let catalogAt = 0, catalogCache = [];
async function visionCatalog() {
  if (Date.now() - catalogAt < 30 * 60e3 && catalogCache.length) return catalogCache;
  /* min/max — межі скупника: з ними ціну з прокручуваного списку можна взяти з одного кадру (pricescan.cjs);
     last — ціна на сайті: товар без меж не отримає зчитку, що відрізняється від неї більш ніж удвічі (specs/004) */
  const { data, error } = await sb.from('buyer_items').select('buyer_id,item_id,min_price,max_price,price,items(name,aliases)');
  if (!error) { catalogCache = (data || []).filter(r => r.items).map(r => ({ id: r.item_id, name: r.items.name, aliases: r.items.aliases || [], buyer_id: r.buyer_id, min: Number(r.min_price) || 0, max: Number(r.max_price) || 0, last: Number(r.price) || 0 })); catalogAt = Date.now(); }
  return catalogCache;
}
/* кадр екрана гри (основний монітор) у повному розмірі */
async function captureFrame() {
  const d = screen.getPrimaryDisplay();
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  return (srcs.find(s => s.display_id === String(d.id)) || srcs[0])?.thumbnail || null;
}
/* ціни скупника → сайт від імені гравця; сервер сам перевіряє межі, ліміт за годину й цикл цін */
/* час наступної зміни цін з вікна скупника — на сайт від імені гравця (база перевіряє, що це найближчі 24 год і є нік зі статіком) */
async function autoNextChange(buyer, at) {
  const { error } = await sb.rpc('set_next_change', { p_buyer: buyer, p_at: new Date(at).toISOString() });
  try { fs.appendFileSync(visionLog(), `${new Date().toISOString()} next sent ${buyer}: ${error ? 'ні — ' + error.message : 'так'}
`); } catch { /* журнал не обов'язковий */ }
}
async function autoPrices(rows) {
  let ok = 0;
  /* від персонажа, під яким зайшли в програму (specs/025 FR-014): ціни щойно зчитані, тож це той самий персонаж, що й у момент зчитування */
  const character_id = settings.character;
  let why = '';
  for (const r of rows) {
    /* outside — голос за ціну поза межами скупника (specs/035 US1, міграція 0054): база пускає його лише в правдоподібному коридорі */
    const row = { kind: 'buyer', buyer_id: r.buyer_id, item_id: r.item_id, price: r.price, source: 'desktop', character_id };
    const { error } = await sb.from('price_reports').insert(r.outside ? { ...row, out_of_limits: true } : row);
    if (!error) ok++; else if (error.code === 'P0001') why = error.message;
  }
  try { fs.appendFileSync(visionLog(), `${new Date().toISOString()} prices sent ${ok}/${rows.length}${why ? ' — ' + why : ''}\n`); } catch { /* журнал не обов'язковий */ }
  /* без ніка база не приймає жодної ціни — один раз попросити вибрати нік (не на кожне сканування поверх гри) */
  if (!ok && why === 'Спершу вибери нік акаунта.' && hasNick !== false) { hasNick = false; showLogin(); }
  if (ok) pricesAt = 0;   // плашка Alt+Q одразу покаже нові ціни
}
/* назва товару, якого немає в Q-Hub, — пропозиція адміну (specs/024, FR-010); без зв'язку — пропускаємо, це не критично */
async function autoUnknown(buyer, text) {
  const { error } = await sb.rpc('report_unknown_item', { p_buyer: buyer, p_text: text });
  try { fs.appendFileSync(visionLog(), `${new Date().toISOString()} unknown sent ${buyer}: ${error ? 'ні — ' + error.message : 'так'}\n`); } catch { /* журнал не обов'язковий */ }
}
/* ціна поза межами скупника, впевнено прочитана тричі, — адміну «перевір межі» (specs/024, T031); на сайт вона не йде */
async function autoLimits(buyer, item, price) {
  const { error } = await sb.rpc('report_limit_mismatch', { p_buyer: buyer, p_item: item, p_price: price });
  try { fs.appendFileSync(visionLog(), `${new Date().toISOString()} limits sent ${buyer}/${item} ${price}: ${error ? 'ні — ' + error.message : 'так'}\n`); } catch { /* журнал не обов'язковий */ }
}
function startVision() {
  trimLog(visionLog());   // завеликий журнал — лишається хвіст, а не порожній файл
  const eye = vision({
    nativeImage, logFile: visionLog(), capture: captureFrame, catalog: visionCatalog,
    /* гра йде — HUD читаємо завжди (прибуток за годину сеансу, specs/040); ціни скупників — за налаштуванням і з персонажем */
    active: () => !!settings.session,
    prices: () => prefs().autoPrices !== false && !!settings.character,
    onMoney, onPrices: autoPrices, onNextChange: autoNextChange,
    onCoverage: c => { onCoverage(c).catch(() => {}); }, onUnknown: autoUnknown, onLimits: autoLimits,
  });
  setInterval(() => eye.tick(), TICK_POLL);
}

/* таймер ігрової сесії: гра запущена — сесія йде, гру закрито — записана (session.cjs) */
function startSessionTimer() {
  const tick = gameSession.tracker({
    running: async () => { const p = await gameSession.processes(); return p ? gameSession.GAME.some(n => p.has(n)) : null; },
    started: gameSession.gameStart,
    now: Date.now,
    uuid: randomUUID,
    character: () => settings.character || null,
    money: sessionSummary,
    db: {
      /* upsert за id: повторна відправка (без зв'язку, черга) не створює дубля — конституція V */
      write: async row => {
        let { error } = await sb.from('game_sessions').upsert(row, { onConflict: 'id' });
        /* база ще без 0049 (немає колонок money_*) — сесію все одно пишемо, лише без грошей */
        if (error?.code === 'PGRST204' && 'money_gain' in row) ({ error } = await sb.from('game_sessions').upsert(gameSession.withoutMoney(row), { onConflict: 'id' }));
        return !error;
      },
      drop: async id => { await sb.from('game_sessions').delete().eq('id', id); },
    },
    load: () => settings.session || null,
    save: v => { settings.session = v; saveSettings(); },
    changed: () => { trayTip(); bar?.webContents.send('changed'); },
    loadQueue: () => settings.sessionQueue || [],
    saveQueue: v => { settings.sessionQueue = v; saveSettings(); },
  });
  const run = () => tick().catch(() => {});   // мережа впала — наступна спроба за 10 с
  run(); setInterval(run, 10e3);
  const rules = () => loadMoneyRules().catch(() => {});   // без зв'язку — збережені пороги
  rules(); setInterval(rules, 36e5);
}

/* ---------- сповіщення (lib/alerts.cjs ← src/lib/alerts.ts): «час здавати» (specs/075), івенти за 10 хв (076),
   таймер оголошення на маркеті (077). Тут лише тик, збереження й показ; що й коли сповіщати — у чистих функціях з тестами.
   Усе локально: у базу нічого не пишеться, у грі програма нічого не робить ---------- */
const ALERT_TICK = 20e3, SELL_EVERY = 5 * 60e3;
let sellAt = 0, sellBusy = false, charNames = new Map();
const sentOf = k => (settings.alertSent ??= {})[k] || {};
/* товари, за якими гравець стежить (дзвіночок у «Цінах»): складу програма не веде (specs/040) */
const watch = () => alerts.watchList(settings.watch);
const markets = () => (settings.market && typeof settings.market === 'object' ? settings.market : {});
const marketOf = id => { const t = id && markets()[id]; return alerts.marketValid(t) ? { hours: t.hours, ends: t.ends } : null; };
async function sellCheck() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const r = alerts.sellDue(watch(), await barPrices(true), sentOf('sell'), Date.now());
  if (r.changed) { settings.alertSent.sell = r.sent; saveSettings(); }
  if (r.note) notify(r.note, openFromToast);
}
function alertsTick() {
  const now = Date.now(), p = prefs();
  if (p.eventAlert) {
    const r = alerts.eventDue(alerts.eventIds(p.eventIds), sentOf('events'), now);
    if (r.note) { settings.alertSent.events = r.sent; saveSettings(); notify(r.note, openFromToast); }
  }
  /* таймери всіх персонажів: оголошення спливає і в того, ким зараз не граєш */
  for (const [id, t] of Object.entries(markets())) {
    if (!alerts.marketValid(t)) continue;
    const r = alerts.marketDue(t, now);
    if (!r.kind) continue;
    settings.market[id] = r.t; saveSettings();
    notify(alerts.marketNote(r.kind, r.t, now, r.late, charNames.size > 1 ? charNames.get(id) || '' : ''), openFromToast);
  }
  /* ціни — раз на 5 хв і лише коли є за чим стежити: без позначених товарів програма по них не ходить */
  if (p.sellAlert && !sellBusy && now - sellAt >= SELL_EVERY && watch().length) {
    sellAt = now; sellBusy = true;
    sellCheck().catch(() => {}).finally(() => { sellBusy = false; });
  }
}
function startAlerts() {
  settings.market = alerts.marketPrune(settings.market, null, Date.now());
  alertsTick(); setInterval(alertsTick, ALERT_TICK);
}

/* помилка запуску — повідомлення замість тихого виходу без вікна */
const fail = e => { dialog.showErrorBox('Q-Hub не запустився', String(e?.stack || e)); app.quit(); };
process.on('uncaughtException', fail);

app.whenReady().then(() => {
  /* відкрили посеред оновлення — не заважати інсталятору: він сам запустить нову версію */
  let mark = null;
  try { mark = JSON.parse(fs.readFileSync(installMark(), 'utf8')); } catch { /* немає — звичайний запуск */ }
  if (installPending(mark, app.getVersion(), Date.now())) {
    dialog.showMessageBoxSync({ type: 'info', title: 'Q-Hub', message: 'Q-Hub оновлюється', detail: 'Зачекай, поки вікно встановлення закінчить роботу, — програма відкриється сама.' });
    return app.exit(0);
  }
  if (mark) try { fs.unlinkSync(installMark()); } catch { /* не страшно: застаріла позначка нічого не блокує */ }
  Menu.setApplicationMenu(null);   // без меню «File / Edit / View» і його гарячих клавіш — це програма, не браузер
  const hadSettings = fs.existsSync(settingsFile());
  try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; }
  /* автозапуск (specs/009): новий гравець — увімкнено; хто вже має Q-Hub — як було (запис 0.3.x переносимо на новий);
     далі щоразу оновлюємо шлях — після перевстановлення в іншу теку запис веде туди (FR-011–FR-013) */
  if (app.isPackaged) {
    /* галочка «Запускати разом з Windows» в інсталяторі (specs/008): файл читаємо один раз і прибираємо */
    const instFile = path.join(dir(), 'installer.json');
    let chosen;
    try { chosen = JSON.parse(fs.readFileSync(instFile, 'utf8')).autostart; fs.rmSync(instFile, { force: true }); } catch { /* файла немає — як раніше */ }
    const want = autostartOnStart({ init: !!settings.autostartInit, hadSettings, oldOn: app.getLoginItemSettings().openAtLogin, on: autostart(), chosen });
    if (want !== null) setAutostart(want);
    if (!settings.autostartInit) { settings.autostartInit = true; saveSettings(); }
  }
  /* після спроби оновлення: та сама версія — інсталятор не впорався, наступна автоспроба не раніше ніж за 3 год;
     нова — один раз сказати, що оновлено (у плашці — «Програму оновлено — що нового») */
  if (mark?.from && mark.from === app.getVersion()) { settings.updateFailAt = mark.at; saveSettings(); }
  const updatedFrom = mark?.from && mark.from !== app.getVersion() ? mark.from : null;
  if (updatedFrom && settings.updateFailAt) { delete settings.updateFailAt; saveSettings(); }
  /* збережене раніше F9 гра забирає собі — один раз переводимо на Alt+F9 (стандартна з 0.3) */
  if (settings.bar?.pinKey === 'F9') { settings.bar.pinKey = 'Alt+F9'; saveSettings(); }
  const enc = s => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s));
  const dec = b => (safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString());
  sb = makeClient(cfg, fileStorage(path.join(dir(), 'session.bin'), enc, dec));
  /* файли мапи сайту для вікна мапи — з кешем на диску, без інтернету — з кешу (qmap.cjs) */
  const qmap = createQmap({ site: cfg.site, dir: path.join(dir(), 'map', 'site') });
  protocol.handle('qmap', req => qmap.handle(req));

  /* оновлені токени — одразу в кабінет плашки, інакше він за годину лишиться з простроченим ключем */
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(() => refreshRole().catch(() => {}), 0);   // F9 — лише для редакторів
    if (!bar) return;
    if (ev === 'TOKEN_REFRESHED' || ev === 'SIGNED_IN') tokens().then(t => bar?.webContents.send('session', t));
    if (ev === 'SIGNED_OUT') { hasNick = null; bar.webContents.send('session', null); bar.hide(); showLogin(); }
  });

  ipcMain.handle('state', () => state());
  ipcMain.handle('session', e => (trusted(e) ? tokens() : null));
  ipcMain.handle('cabinet', () => openHub());
  /* плашка входу підганяє висоту вікна під себе (довкола неї — прозоре поле під тінь) і ховається в трей своїм хрестиком */
  const fromGate = e => gate && e.sender === gate.webContents;
  ipcMain.handle('gate-size', (e, h) => {
    if (!fromGate(e) || !Number.isFinite(h)) return;
    const b = gate.getBounds(), nh = Math.round(Math.min(720, Math.max(240, h)));
    gate.setBounds({ x: b.x, y: Math.round(b.y + (b.height - nh) / 2), width: GATE_W, height: nh });
  });
  ipcMain.handle('gate-hide', e => { if (fromGate(e)) gate.hide(); });
  /* налаштування встановлення на екрані входу: інсталятор нічого не питає, вибір — тут */
  const setup = () => ({ packaged: app.isPackaged, autostart: autostart(), desk: hasDeskLink() });
  ipcMain.handle('setup', e => (fromGate(e) ? setup() : null));
  ipcMain.handle('setup-set', (e, p) => {
    if (!fromGate(e) || !app.isPackaged) return null;
    let error = null;
    if (typeof p?.autostart === 'boolean') { if (setAutostart(p.autostart)) trayMenu(); else error = AUTOSTART_ERR; }
    if (typeof p?.desk === 'boolean' && !setDeskLink(p.desk)) error = 'Не вдалося змінити ярлик на робочому столі.';
    return { ...setup(), error };
  });
  /* «Швидкий запис» у кабінеті відкриває ту саму плашку, що й Alt+Q */
  ipcMain.handle('open-bar', e => { if (trusted(e)) return showBar().then(() => prefs().hotkey); });
  ipcMain.handle('hotkey', e => (trusted(e) ? prefs().hotkey : null));
  ipcMain.handle('login', async () => {
    try { await login(sb, openExternal); gate?.show(); gate?.focus(); return await state(); }
    catch (e) { return { user: null, error: 'Вхід не вдався: ' + e.message }; }
  });
  ipcMain.handle('logout', async e => {
    await sb.auth.signOut();
    if (bar && e.sender === bar.webContents) { bar.hide(); showLogin(); }   // вийшов з плашки — назад до входу
    return { user: null };
  });
  ipcMain.handle('character', (_e, id) => { if (typeof id === 'string') { settings.character = id; saveSettings(); } return true; });
  /* новий персонаж — у плашці входу: кабінет на сайті лише для перегляду, створити там не можна */
  ipcMain.handle('char-add', async (e, p) => {
    if (!fromGate(e)) return null;
    const fail = async error => ({ ...(await state()), error });
    const c = parseCharacter(p);
    if (c.error) return fail(c.error);
    const { name, stat, start } = c;
    /* статік — у персонажа (specs/025): база перевіряє, що він вільний, а персонажів не більше трьох */
    const { data, error } = await sb.from('characters').insert({ name, static_id: stat, start_balance: start }).select('id').single();
    if (error) return fail(dbMsg(error, 'Не вдалося створити персонажа. Перевір інтернет і спробуй ще раз.'));
    settings.character = data.id; saveSettings();
    return state();
  });
  /* нік акаунта — з плашки входу й з налаштувань плашки; формат перевіряє і програма, і база */
  ipcMain.handle('nick-set', async (e, s) => {
    if (!fromGate(e) && !fromBar(e)) return null;
    const fail = async error => ({ ...(await state()), error });
    const n = parseNick(s);
    if (n.error) return fail(n.error);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return fail('Сесія закінчилась — увійди ще раз.');
    const { error } = await sb.from('profiles').update({ nick: n.nick }).eq('id', session.user.id);
    if (error) return fail(dbMsg(error, 'Не вдалося зберегти нік. Перевір інтернет і спробуй ще раз.'));
    return state();
  });
  ipcMain.handle('site', (_e, p) => openExternal(cfg.site + (typeof p === 'string' && p.startsWith('/') ? p : '/')));
  /* питання до ШІ — лише з плашки, не зі сторінок сайту */
  const fromBar = e => bar && e.sender === bar.webContents;
  ipcMain.handle('quick-ask', (e, text, rules) => (fromBar(e) ? quickAsk(text, rules) : null));
  /* плашка росте під відповідь помічника */
  /* плашка росте під вміст; знизу екрана — угору, щоб не вилізти за край */
  ipcMain.handle('quick-size', (e, h, w) => {
    if (!fromBar(e) || !Number.isFinite(h)) return;
    h = Math.round(Math.min(BAR_MAX_H, Math.max(90, h)));
    const b = bar.getBounds();
    w = Math.round(Math.min(BAR_MAX_W, Math.max(BAR_W, Number.isFinite(w) ? w : BAR_W)));   // ширшає й вужчає від центру
    bar.setBounds({ x: Math.round(b.x + (b.width - w) / 2), y: prefs().position === 'bottom' ? b.y + b.height - h : b.y, width: w, height: h });
  });
  ipcMain.handle('bar-data', e => (fromBar(e) ? barData() : null));
  /* списання продажу скупнику (specs/030, contracts/bar-sale.md) */
  /* правила для пошуку плашки: знімок rules-sync з кешу; null — плашка бере вбудовану копію (specs/010 US4) */
  ipcMain.handle('rules-data', e => (fromBar(e) ? rulesSnap().current() : null));
  /* історія: плашка пише пошуки й відповіді ШІ, вікно історії читає їх разом із записами й повертає вибране в плашку */
  /* історія — у самій плашці (ліва колонка): читає й чистить її лише плашка */
  ipcMain.handle('hist-add', (e, it) => { if (fromBar(e)) histAdd(it); });
  ipcMain.handle('hist-data', async e => (fromBar(e) ? { items: histLoad() } : null));
  ipcMain.handle('hist-del', (e, id) => { if (fromBar(e)) { histItems = histLoad().filter(i => i.id !== id); histSave(); } });
  ipcMain.handle('hist-clear', e => { if (fromBar(e)) { histItems = []; histSave(); } });
  /* мапа (specs/014, contracts/ipc-map.md): плашка відкриває, вікно мапи ховається й питає клавішу */
  const fromMap = e => mapw && e.sender === mapw.webContents;
  ipcMain.handle('map-toggle', e => (fromBar(e) ? toggleMap('bar') : null));
  ipcMain.handle('map-hide', e => { if (fromMap(e)) hideMap(); });
  ipcMain.handle('map-key', e => (fromMap(e) ? prefs().mapKey : null));
  ipcMain.handle('map-where', async e => (fromMap(e) ? whereFrom(await grabClean().catch(() => null)) : null));
  ipcMain.handle('map-open', (e, p) => { if (fromBar(e) && p && Number.isFinite(p.x) && Number.isFinite(p.y)) openMapAt(p); });
  ipcMain.handle('map-focus-take', e => { if (!fromMap(e)) return null; const f = mapFocus; mapFocus = null; return f; });
  /* скільки питань до ШІ лишилось сьогодні (0027_assistant_limit_50.sql); без міграції — null */
  ipcMain.handle('ai-left', async e => { if (!fromBar(e)) return null; const { data, error } = await sb.rpc('assistant_left'); return error ? null : data; });
  ipcMain.handle('bar-character', (e, id) => (fromBar(e) ? barCharacter(id) : null));
  ipcMain.handle('bar-prefs', (e, p) => (fromBar(e) ? barPrefs(p) : null));
  /* сповіщення (specs/075–077, contracts/ipc-alerts.md): дзвіночок біля товару, таймер оголошення, перевірка сповіщень */
  ipcMain.handle('watch-toggle', (e, id) => {
    if (!fromBar(e)) return null;
    settings.watch = alerts.watchToggle(watch(), id); saveSettings();
    sellAt = 0;   // щойно позначений товар перевірити найближчим тиком, а не за 5 хв
    return settings.watch;
  });
  ipcMain.handle('watch-clear', e => { if (!fromBar(e)) return null; settings.watch = []; saveSettings(); return []; });
  ipcMain.handle('market-set', (e, v) => {
    if (!fromBar(e)) return null;
    const hours = alerts.marketHours(v);
    if (hours === null) return { error: alerts.MARKET_HINT };
    if (!settings.character) return { error: 'Спершу вибери персонажа.' };
    settings.market = { ...markets(), [settings.character]: alerts.marketStart(hours, Date.now()) }; saveSettings();
    return { market: marketOf(settings.character) };
  });
  ipcMain.handle('market-clear', e => {
    if (!fromBar(e)) return null;
    const m = { ...markets() }; delete m[settings.character];
    settings.market = m; saveSettings();
    return { market: null };
  });
  ipcMain.handle('notify-test', e => (fromBar(e) ? notify({ title: 'Q-Hub: сповіщення працюють', body: 'Так виглядатимуть «час здавати», івенти й таймер оголошення.' }, openFromToast) : null));
  ipcMain.handle('shot-label', async (e, name, label, note, share) => {
    if (!fromBar(e) || !shotStore || !shotStore.label(name, label, note)) return { ok: false };
    if (typeof share === 'boolean' && share !== prefs().shareShots) barPrefs({ shareShots: share });
    return { ok: true, shared: share ? await shareShot(name, label, note) : false };
  });
  ipcMain.handle('shots-stats', e => { if (!fromBar(e)) return null; shotStore ??= shots.store(path.join(dir(), 'shots')); return { stats: shotStore.stats(), labels: shots.LABELS, key: SHOT_KEY }; });
  ipcMain.handle('vision-log-open', e => { if (fromBar(e)) shell.openPath(visionLog()); });
  ipcMain.handle('keys-pause', (e, on) => { if (fromBar(e)) pauseKeys(!!on); });
  ipcMain.handle('shots-open', e => { if (!fromBar(e)) return; shotStore ??= shots.store(path.join(dir(), 'shots')); shell.openPath(shotStore.dir); });
  ipcMain.handle('quick-hide', e => { if (fromBar(e)) hideBarToGame(); });
  /* F9: форма категорії — «надіслати» чи «не надсилати» */
  ipcMain.handle('pin-decide', (e, send, hint) => {
    if (!fromBar(e) || !pinAsk) return;
    const a = pinAsk; pinAsk = null; bar.hide(); pinAsk = a;   // hide не має скасувати те, що вибрали
    pinDecide(send === true, hint && typeof hint === 'object' ? hint : {});
  });
  /* кнопка «Оновити» в кабінеті */
  ipcMain.handle('update-state', e => (trusted(e) ? { ...(updates?.state() || { status: 'idle' }), current: app.getVersion(), auto: autoUpdate() } : null));
  ipcMain.handle('update-install', e => { if (trusted(e)) updates?.install(); });

  /* запустила Windows — без вікон: лише трей; вхід — кліком по іконці чи Alt+Q (specs/009 FR-001, FR-002) */
  if (!autostarted) showLogin();
  createBar();
  createStrip();
  createTray();
  /* після автозапуску важке — через 30 с, щоб не гальмувати ввімкнення ПК (FR-004); клавіші — одразу (FR-005) */
  const later = f => (autostarted ? setTimeout(f, 30e3) : f());
  later(startUpdates);
  later(() => pullRules(true)); setInterval(() => pullRules(true), 6 * 3600e3);
  if (autostarted) sb.auth.getSession().then(({ data }) => {
    if (!data.session || !settings.character) tray?.displayBalloon?.({ title: 'Q-Hub', content: `Увійди в Q-Hub — клікни іконку в треї або натисни ${prefs().hotkey}.` });
  }).catch(() => {});
  if (updatedFrom) notify({ title: `Q-Hub оновлено до ${app.getVersion()}`, body: 'Що нового — у плашці Alt+Q: «Програму оновлено — що нового».' }, openFromToast);
  later(startDrafts);
  startOnline();
  startSessionTimer();
  later(startVision);
  later(startAlerts);
  /* журнали діагностики не ростуть без кінця (store.cjs) */
  for (const n of ['pin.log', 'update.log']) trimLog(path.join(dir(), n));
  if (!globalShortcut.register(SHOT_KEY, () => captureShot().catch(() => {})))
    tray?.displayBalloon?.({ title: 'Q-Hub', content: `${SHOT_KEY} зайнята іншою програмою — навчальні знімки недоступні.` });
  if (!registerMapKey(prefs().mapKey))
    tray?.displayBalloon?.({ title: 'Q-Hub', content: `${prefs().mapKey} зайнята іншою програмою — мапу відкривай кнопкою «Мапа» в плашці або зміни клавішу в налаштуваннях.` });
  if (!registerHotkey(prefs().hotkey))
    dialog.showErrorBox('Q-Hub', `${prefs().hotkey} уже зайнята іншою програмою — плашку відкривай з іконки в треї або зміни клавішу в налаштуваннях плашки.`);
}).catch(fail);

/* друга копія програми не запускається — просто показує першу (інакше Alt+Q і порти входу зайняті) */
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => showMain());
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
