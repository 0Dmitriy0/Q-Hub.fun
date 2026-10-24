/* Q-Hub Desktop — головний процес: вхід, сесія, вибір персонажа, кабінет, швидкий запис по Alt+Q. Далі — баланс з екрана. */
const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog, globalShortcut, Tray, Menu, Notification, screen, desktopCapturer, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const cfg = require('./config.json');
const { makeClient, login } = require('./auth.cjs');
const { fileStorage } = require('./store.cjs');
const quick = require('./quick.cjs');
const gameSession = require('./session.cjs');
const shots = require('./shots.cjs');
const { vision } = require('./vision.cjs');
const { createUpdater } = require('./updater.cjs');
const { outbox, pinKeyConflict } = require('./outbox.cjs');
const mapmatch = require('./mapmatch.cjs');
const { loadMapRef } = require('./mapref.cjs');
const { Worker } = require('node:worker_threads');
const { createWorker } = require('tesseract.js');
const SHOT_KEY = 'Alt+S';

/* плашка Alt+Q: ширина й найбільша висота (розгорнута на дві панелі) */
const BAR_W = 960, BAR_MAX_H = 600;
/* інтерфейс кабінету вбудований у програму (зібраний з src/desktop сайту в ui/) — не сторінка сайту в рамці */
const UI = path.join(__dirname, 'ui', 'app.html');
/* власний заголовок вікна: кнопки Windows малює система поверх наших 40 px */
const TITLE_BAR = { color: '#070707', symbolColor: '#a8a29e', height: 40 };

let sb, win, bar, tray, quitting = false, settings = {};
const dir = () => app.getPath('userData');
const settingsFile = () => path.join(dir(), 'settings.json');
const saveSettings = () => fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));

/* лише адреси сайту й Discord відкриваються в браузері; все інше — ні */
const openExternal = url => { if (/^https:\/\//.test(url)) shell.openExternal(url); };
const isCabinet = url => url.startsWith('file:') && url.includes('/ui/app.html');
/* токени — лише нашим власним сторінкам з диска (вхід і кабінет) */
const trusted = e => (e.senderFrame?.url || '').startsWith('file:');

/* сесія для кабінету: оновлює її лише програма, сторінка отримує готові токени */
async function tokens() {
  const { data: { session } } = await sb.auth.getSession();
  return session ? { access_token: session.access_token, refresh_token: session.refresh_token, character: settings.character || null } : null;
}

function showLogin() {
  win.setResizable(false); win.setMaximizable(false); if (win.isMaximized()) win.unmaximize();
  win.setMinimumSize(420, 560); win.setSize(420, 560); win.center();
  win.setTitleBarOverlay(TITLE_BAR);
  win.loadFile(path.join(__dirname, 'index.html'));
}
/* кабінет відкривається там і такого розміру, як його лишили минулого разу */
function showCabinet() {
  const b = settings.bounds;
  win.setResizable(true); win.setMaximizable(true); win.setMinimumSize(1000, 680);
  if (b && screen.getAllDisplays().some(d => { const a = d.workArea; return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y; })) win.setBounds(b);
  else { win.setSize(1280, 820); win.center(); }
  if (settings.maximized) win.maximize();
  win.setTitleBarOverlay(TITLE_BAR);
  win.loadFile(UI, { hash: '/kabinet' });
}
const rememberBounds = () => {
  if (!isCabinet(win.webContents.getURL())) return;
  settings.maximized = win.isMaximized();
  if (!settings.maximized) settings.bounds = win.getBounds();
  saveSettings();
};

async function state() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { user: null };
  const meta = session.user.user_metadata || {};
  const [{ data: profile }, { data: chars, error }] = await Promise.all([
    sb.from('profiles').select('game_name,static_id').eq('id', session.user.id).maybeSingle(),
    sb.from('characters').select('id,name').order('created_at'),
  ]);
  if (error) return { user: null, error: 'Не вдалося завантажити персонажів. Перевір інтернет і спробуй ще раз.' };
  const characters = chars || [];
  if (!characters.some(c => c.id === settings.character)) { settings.character = characters[0]?.id || null; saveSettings(); }
  return {
    user: { name: meta.custom_claims?.global_name || meta.full_name || meta.name || 'Гравець', avatar: meta.avatar_url || null,
      gameName: profile?.game_name || '', staticId: profile?.static_id || null },
    characters, character: settings.character,
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 420, height: 560, resizable: false, maximizable: false, title: 'Q-Hub', backgroundColor: '#070707', show: false,
    icon: path.join(__dirname, 'icon.png'), titleBarStyle: 'hidden', titleBarOverlay: TITLE_BAR,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());   // без білого спалаху до першого кадру
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  /* вікно не переходить нікуди з наших сторінок: посилання назовні — у браузер */
  win.webContents.on('will-navigate', (e, url) => { e.preventDefault(); openExternal(url); });
  /* як програма, а не сторінка: без масштабування Ctrl+колесо / Ctrl±, без перезавантаження F5 */
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.on('before-input-event', (e, i) => {
    if ((i.control && ['+', '-', '=', '0', 'r', 'R'].includes(i.key)) || i.key === 'F5') e.preventDefault();
  });
  win.webContents.on('zoom-changed', () => win.webContents.setZoomFactor(1));
  win.on('resized', rememberBounds); win.on('moved', rememberBounds);
  win.on('maximize', rememberBounds); win.on('unmaximize', rememberBounds);
  /* хрестик ховає в трей: Alt+Q має працювати й без вікна */
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
  showLogin();
}
const showMain = () => { win.show(); win.focus(); };

/* плашка швидкого запису: без рамки, поверх усього, зникає, щойно фокус пішов (повернувся в гру) */
function createBar() {
  bar = new BrowserWindow({
    width: BAR_W, height: 150, show: false, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, title: 'Q-Hub · швидкий запис',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  bar.setAlwaysOnTop(true, 'screen-saver');
  bar.setOpacity(prefs().opacity);
  bar.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
    bar.hide();
  });
  /* плашку закрили, не вибравши «надіслати» (Esc, повернувся в гру) — знімок без точки не надсилається */
  bar.on('hide', () => { if (pinAsk) { pinAsk = null; pinLog('F9 без точки — не надіслано (плашку закрито)'); } });
  bar.loadFile(path.join(__dirname, 'ui', 'bar.html'));
}
/* де з'являється плашка: зверху, по центру чи внизу екрана, на якому зараз курсор */
function placeBar() {
  const { workArea: a } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const y = { top: a.y + 24, center: a.y + Math.round(a.height * 0.22), bottom: a.y + a.height - bar.getSize()[1] - 24 }[prefs().position];
  bar.setPosition(Math.round(a.x + (a.width - BAR_W) / 2), Math.max(a.y, y));
}
/* показати плашку поверх гри й узяти фокус (blur вище не дає грі одразу сховати її) */
let barShownAt = 0, barSteals = 0;
function raiseBar() {
  barShownAt = Date.now(); barSteals = 0;
  bar.show(); bar.moveTop(); bar.focus();
}
async function toggleBar() {
  if (bar.isVisible()) { bar.hide(); return; }
  await showBar();
}
async function showBar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session || !settings.character) { showMain(); return; }   // спершу вхід і персонаж
  placeBar();
  raiseBar();
  bar.webContents.send('quick-show');
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  tray.setToolTip(`Q-Hub — ${prefs().hotkey}: швидкий запис`);
  trayMenu();
  tray.on('click', showMain);
}
/* меню трею; є нова версія — зверху пункт «Оновити» */
function trayMenu() {
  const u = updates?.state();
  tray?.setContextMenu(Menu.buildFromTemplate([
    ...(u && u.status !== 'idle' ? [{ label: u.status === 'downloading' ? `Оновлення ${u.percent}%…` : `Оновити до ${u.version}`, enabled: u.status !== 'downloading', click: () => updates.install() }, { type: 'separator' }] : []),
    { label: 'Швидкий запис', click: () => toggleBar() },
    { label: 'Відкрити Q-Hub', click: showMain },
    { type: 'separator' },
    { label: 'Вийти з програми', click: () => { quitting = true; app.quit(); } },
  ]));
}

/* ---------- оновлення програми (updater.cjs): перевірка раз на 3 год, ставиться лише після кнопки «Оновити» ---------- */
let updates = null, notifiedVersion = null;
function startUpdates() {
  if (!app.isPackaged) return;   // з npm start оновлювати нічого: це не встановлена програма
  const { autoUpdater } = require('electron-updater');
  updates = createUpdater({
    autoUpdater,
    beforeInstall: () => { quitting = true; },
    log: m => { try { fs.appendFileSync(path.join(dir(), 'update.log'), `${new Date().toISOString()} ${m}\n`); } catch { /* журнал не обов'язковий */ } },
    onChange: s => {
      win?.webContents.send('update', s);
      trayMenu();
      /* сповіщення Windows — один раз на кожну нову версію */
      if (s.status === 'available' && s.version !== notifiedVersion && Notification.isSupported()) {
        notifiedVersion = s.version;
        const n = new Notification({ title: 'Вийшла нова версія Q-Hub', body: `${s.version} — натисни «Оновити» в програмі або в меню іконки в треї.`, icon: path.join(__dirname, 'icon.png') });
        n.on('click', showMain); n.show();
      }
    },
  });
  setTimeout(() => updates.check(), 15e3);
  setInterval(() => updates.check(), 3 * 3600e3);
}

const charName = async () => (await sb.from('characters').select('name').eq('id', settings.character).maybeSingle()).data?.name || '';
/* відкритий кабінет одразу показує нові записи — сторінки перечитують дані, без перезавантаження */
const refreshCabinet = () => { if (isCabinet(win.webContents.getURL())) win.webContents.send('changed'); };

/* Shift+Enter: записати рядок за правилами, без помічника */
async function quickAdd(text) {
  const r = quick.parse(text);
  if (!r) return { error: 'Немає суми — напиши, наприклад, 450к' };
  const err = r.kind === 'transfer' ? await insertTransfer(settings.character, r.from, r.to, r.amount)
    : (await sb.from('transactions').insert({ character_id: settings.character, type: r.type, amount: r.amount, category: r.category, note: r.note, source: 'desktop', account: r.account })).error;
  if (err) return { error: 'Не вдалося записати. Перевір інтернет і спробуй ще раз.' };
  refreshCabinet();
  return { ok: true, character: await charName() };
}

/* Enter: спитати помічника (supabase/functions/assistant). План лишається тут — виконується лише він, після другого Enter */
let plan = null;
async function quickAsk(text) {
  plan = null;
  const { data, error } = await sb.functions.invoke('assistant', { body: { text: String(text).slice(0, 500), character_id: settings.character } });
  if (error) {
    const msg = await error.context?.json?.().then(b => b.error).catch(() => null);
    return { error: msg || 'Помічник недоступний. Перевір інтернет або запиши через Shift+Enter.' };
  }
  plan = { reply: String(data.reply || ''), actions: Array.isArray(data.actions) ? data.actions : [] };
  return plan;
}
async function quickRun() {
  if (!plan?.actions.length) return { error: 'Нема чого записувати' };
  const c = settings.character;
  for (const a of plan.actions) {
    if (a.kind === 'transfer') {
      if (await insertTransfer(c, a.from, a.to, a.amount)) return { error: 'Не вдалося записати переказ.' };
      continue;
    }
    if (a.kind === 'delete' || a.kind === 'edit') {
      const err = a.kind === 'delete' ? await deleteTx(c, a.id) : await editTx(c, a.id, a.set);
      if (err) return { error: err };
      continue;
    }
    if (a.kind === 'tx') {
      const { error } = await sb.from('transactions').insert({ character_id: c, type: a.type, amount: a.amount, category: a.category, note: a.note, source: 'desktop', account: a.account === 'card' ? 'card' : 'cash' });
      if (error) return { error: 'Не вдалося записати. Перевір інтернет і спробуй ще раз.' };
      continue;
    }
    const err = await insertDeal(c, a);
    if (err) return { error: err };
  }
  plan = null;
  refreshCabinet();
  return { ok: true, character: await charName() };
}

/* переказ між готівкою й карткою — пара записів з одним часом (не прибуток і не витрата); повертає помилку або null */
const ACC = { cash: 'Готівка', card: 'Картка' };
async function insertTransfer(c, from, to, amount) {
  if (!ACC[from] || !ACC[to] || from === to || !(amount > 0)) return 'bad';
  const ts = new Date().toISOString(), base = { character_id: c, amount: Math.round(amount), category: 'Переказ', note: `${ACC[from]} → ${ACC[to]}`, source: 'transfer', ts };
  const { error } = await sb.from('transactions').insert([{ ...base, type: 'out', account: from }, { ...base, type: 'in', account: to }]);
  return error;
}

/* правка й видалення записів помічником (після Enter гравця). Рядок береться з бази заново — RLS пускає лише до своїх;
   переказ змінюється обома половинами, запис угоди видаляється разом з угодою (інакше товар лишився б на складі) */
async function txRow(c, id) {
  if (typeof id !== 'string') return null;
  const { data } = await sb.from('transactions').select('id,source,ts').eq('id', id).eq('character_id', c).maybeSingle();
  return data;
}
async function deleteTx(c, id) {
  const t = await txRow(c, id);
  if (!t) return 'Запис уже видалено або він не твій.';
  if (t.source === 'transfer') return (await sb.from('transactions').delete().eq('character_id', c).eq('source', 'transfer').eq('ts', t.ts)).error ? 'Не вдалося видалити переказ.' : null;
  if (t.source === 'deal') { const { error } = await sb.from('deals').delete().eq('character_id', c).eq('tx_id', id); if (error) return 'Не вдалося видалити угоду.'; }
  return (await sb.from('transactions').delete().eq('id', id)).error ? 'Не вдалося видалити запис.' : null;
}
async function editTx(c, id, set = {}) {
  const t = await txRow(c, id);
  if (!t) return 'Запис уже видалено або він не твій.';
  const v = {};
  if (set.type === 'in' || set.type === 'out') v.type = set.type;
  if (Number(set.amount) > 0) v.amount = Math.round(Number(set.amount));
  if (typeof set.category === 'string' && set.category.trim()) v.category = set.category.trim().slice(0, 30);
  if (typeof set.note === 'string') v.note = set.note.slice(0, 200);
  if (set.account === 'cash' || set.account === 'card') v.account = set.account;
  if (t.source === 'transfer') {
    const both = {}; if (v.amount) both.amount = v.amount; if (v.note !== undefined) both.note = v.note;
    if (!Object.keys(both).length) return null;
    return (await sb.from('transactions').update(both).eq('character_id', c).eq('source', 'transfer').eq('ts', t.ts)).error ? 'Не вдалося змінити переказ.' : null;
  }
  if (t.source === 'deal') { delete v.type; delete v.amount; }
  if (!Object.keys(v).length) return null;
  return (await sb.from('transactions').update(v).eq('id', id)).error ? 'Не вдалося змінити запис.' : null;
}

/* угода — як у «Угодах» кабінету: спершу запис в облік, потім угода з посиланням на нього; null — успіх */
async function insertDeal(c, a) {
  let txId = null;
  if (a.tx) {
    /* угоди з гравцями й скупниками — готівкою */
    const { data, error } = await sb.from('transactions').insert({ character_id: c, ...a.tx, source: 'deal', account: 'cash' }).select('id').single();
    if (error) return 'Не вдалося записати в облік.';
    txId = data.id;
  }
  const { error } = await sb.from('deals').insert({ character_id: c, op: a.op, item: a.item, qty: a.qty, price: a.price, category: '', tx_id: txId });
  if (error) { if (txId) await sb.from('transactions').delete().eq('id', txId); return `Не вдалося зберегти угоду «${a.item}».`; }
  return null;
}

/* ---------- плашка Alt+Q: дані, персонаж, історія, налаштування ---------- */
const OPS = { buy: 'Купив', farm: 'Нафармив', sell: 'Продав' };
const money = n => new Intl.NumberFormat('uk-UA').format(Math.round(n)).replace(/ /g, ' ') + ' $';
const BAR_DEFAULTS = { pinned: false, position: 'top', opacity: 1, hotkey: 'Alt+Q', mode: 'ai', tab: true, autoLedger: true, autoPrices: true, shareShots: true, pinKey: 'F9' };
const prefs = () => ({ ...BAR_DEFAULTS, ...settings.bar });

/* ціни скупників — раз на 5 хвилин, а не на кожне відкриття плашки */
let pricesAt = 0, pricesCache = [];
async function barPrices() {
  if (Date.now() - pricesAt < 5 * 60e3 && pricesCache.length) return pricesCache;
  const { data, error } = await sb.from('buyer_items').select('price,min_price,max_price,price_at,buyers(id,name,image_url),items(name,unit,image_url)');
  if (error) return pricesCache;
  pricesCache = (data || []).filter(r => r.buyers && r.items).map(r => ({
    item: r.items.name, unit: r.items.unit || 'шт', icon: r.items.image_url || '', buyer: r.buyers.name, buyerIcon: r.buyers.image_url || '',
    price: Number(r.price) || 0, min: Number(r.min_price) || 0, max: Number(r.max_price) || 0, at: r.price_at,
  }));
  pricesAt = Date.now();
  return pricesCache;
}
/* що лежить на складі персонажа: купив і нафармив додають, продав списує */
async function barStock(c) {
  const { data } = await sb.from('deals').select('op,item,qty').eq('character_id', c).limit(5000);
  const m = {};
  for (const d of data || []) m[d.item] = (m[d.item] || 0) + (d.op === 'sell' ? -1 : 1) * Number(d.qty);
  return Object.fromEntries(Object.entries(m).filter(([, q]) => q > 0.001).map(([k, q]) => [k, Math.round(q * 100) / 100]));
}
async function barData() {
  const s = await state();
  if (!s.user) return { user: null };
  const [prices, stock] = await Promise.all([barPrices(), barStock(s.character)]);
  return { ...s, prices, stock, prefs: prefs(), staff: STAFF.includes(myRole) };
}
async function barHistory() {
  const { data } = await sb.from('transactions').select('id,type,amount,category,note,ts,source,account').eq('character_id', settings.character).order('ts', { ascending: false }).limit(20);
  return data || [];
}
/* «Купив / Продав / Нафармив» прямо з картки товару в плашці */
async function quickDeal(op, item, qty, price) {
  if (!OPS[op] || typeof item !== 'string' || !item.trim()) return { error: 'Обери товар' };
  qty = Math.round(Number(qty) * 100) / 100; price = op === 'farm' ? 0 : Math.round(Number(price));
  if (!(qty > 0)) return { error: 'Вкажи кількість' };
  if (op !== 'farm' && !(price > 0)) return { error: 'Вкажи ціну за штуку' };
  const c = settings.character;
  let cat = 'Перекуп';
  if (op === 'sell') {
    const { count } = await sb.from('deals').select('id', { count: 'exact', head: true }).eq('character_id', c).eq('item', item).eq('op', 'buy');
    if (!count) cat = 'Продаж фарму';
  }
  const tx = op === 'farm' ? null : { type: op === 'buy' ? 'out' : 'in', amount: Math.round(qty * price), category: cat, note: `${OPS[op]}: ${item} × ${qty} по ${money(price)}` };
  const err = await insertDeal(c, { op, item: item.trim(), qty, price, tx });
  if (err) return { error: err };
  refreshCabinet();
  return { ok: true, character: await charName() };
}
/* зміна персонажа з плашки — кабінет перемикається разом із нею */
async function barCharacter(id) {
  if (typeof id !== 'string') return false;
  settings.character = id; saveSettings();
  if (isCabinet(win.webContents.getURL())) win.webContents.send('session', await tokens());
  return true;
}
/* знімок екрана, на якому зараз курсор (там гра), у повному розмірі; плашка не має потрапити в кадр */
async function grabScreen() {
  if (bar.isVisible()) { bar.hide(); await new Promise(r => setTimeout(r, 200)); }
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = srcs.find(s => s.display_id === String(d.id)) || srcs[0];
  return !src || src.thumbnail.isEmpty() ? null : src.thumbnail;
}

/* ---------- мітка з гри (F9): знімок великої карти → чернетка на сайт, публікує адмін (specs/001-map-pin-drafts) ----------
   Поки без розпізнавання карти: чернетка йде як «точку не визначено», точку ставить адмін, дивлячись на знімок.
   Клавіша реєструється лише для editor / moderator / admin — гравцям F9 лишається в грі. */
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
  if (STAFF.includes(myRole)) startLocator();
}

/* де гравець на великій карті: mapmatch.cjs в окремому потоці; еталон — з сайту (mapref.cjs). Кожна спроба — у pin.log */
const unpacked = p => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');   // потоки й tesseract читають з диска, не з архіву
const pinLog = m => { try { fs.appendFileSync(path.join(dir(), 'pin.log'), `${new Date().toISOString()} ${m}\n`); } catch { /* журнал не обов'язковий */ } };
let locator = null, locatorReady = false, scaleOcr = null, lid = 0;
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
  locator.on('error', e => { pinLog('locator error ' + (e?.stack || e)); locator = null; locatorReady = false; });
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
    await scaleOcr.setParameters({ tessedit_char_whitelist: '0123456789mk.,', tessedit_pageseg_mode: '7' });
  }
  const part = img.crop(bar.number), { width } = part.getSize();
  const text = (await scaleOcr.recognize(part.resize({ width: width * 3, quality: 'best' }).toPNG())).data.text.trim();
  return { text, meters: mapmatch.scaleMeters(text) };
}
const WHY = { no_map: 'не видно шкали великої карти', zoom_in: 'карта надто віддалена — наблизьте до 50–1500 м',
  zoom_out: 'карта надто наближена — віддаліть до 50–1500 м', unsure: 'не впевнений у місці', no_ref: 'мапа ще завантажується', error: 'помилка розпізнавання' };
async function locatePin(img) {
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
function registerPinKey(key) {
  if (pinKeyReg) { globalShortcut.unregister(pinKeyReg); pinKeyReg = null; }
  if (!STAFF.includes(myRole)) return true;
  const ok = globalShortcut.register(key, () => pinShot().catch(e => showPin('Не вдалося зберегти чернетку: ' + (e?.message || e), true)));
  if (ok) pinKeyReg = key;
  return ok;
}
/* повідомлення поверх гри без фокусу (гра не втрачає керування) — і само ховається */
function showPin(text, bad = false) {
  clearTimeout(pinTimer);
  bar.webContents.send('pin', { text, bad });
  if (!bar.isVisible()) { placeBar(); bar.showInactive(); }
  bar.moveTop();
  pinTimer = setTimeout(() => { if (bar.isVisible() && !bar.isFocused() && !prefs().pinned) bar.hide(); }, 3500);
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
  let loc;
  try { loc = await locatePin(img); } catch (e) { pinLog('locate ' + (e?.stack || e)); loc = { kind: 'error' }; }
  pinLog('F9 ' + JSON.stringify(loc));
  const pt = loc.kind === 'point';
  const { kind, match = {}, ms, scale_text, bar_px, meters } = loc;
  const draft = { taken_at: new Date().toISOString(), x: pt ? loc.x : null, y: pt ? loc.y : null,
    match: { ...match, kind, ms, scale_text, bar_px, meters, screen: [width, height], version: app.getVersion() } };
  /* точку знайдено — одразу на сайт; ні — спершу спитати: на знімку може бути не гра, а чат, Discord тощо */
  if (pt) return sendPin(draft, img.toJPEG(80), `Точка під хрестиком: X ${Math.round(loc.x)} · Y ${Math.round(loc.y)}`);
  pinAsk = { draft, jpeg: img.toJPEG(80) };
  clearTimeout(pinTimer);
  placeBar(); raiseBar();
  bar.webContents.send('pin-ask', { reason: WHY[kind] || kind, preview: img.resize({ width: 480 }).toDataURL(), cats: await pinCats() });
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
  const r = await draftBox().flush();
  if (r.denied) showPin('Немає прав на чернетки міток.', true);
  else if (r.left) showPin(what + '. Відправлю, щойно буде інтернет.');
  else showPin(what + '. Чернетку надіслано.');
}
/* hint — підказка редактора адміну: { category, note } */
function pinDecide(send, hint = {}) {
  const a = pinAsk; pinAsk = null;
  if (!a) return;
  const category_id = typeof hint.category === 'string' && hint.category ? hint.category : null;
  const note = typeof hint.note === 'string' ? hint.note.trim().slice(0, 600) : '';
  if (send) sendPin({ ...a.draft, category_id, note }, a.jpeg, 'Без точки — поставить адмін').catch(e => showPin('Не вдалося зберегти чернетку: ' + (e?.message || e), true));
  else showPin('Не надіслано.');
}
/* знімок у закрите сховище, потім рядок; повтор (файл чи рядок уже є) — це успіх, а не помилка */
async function sendDraft(draft, jpeg) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return 'retry';
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
  const ok = globalShortcut.register(key, () => toggleBar());
  barKey = ok ? key : null;
  return ok;
}
function barPrefs(p) {
  const cur = prefs(), next = { ...cur };
  if (typeof p?.pinned === 'boolean') next.pinned = p.pinned;
  if (['top', 'center', 'bottom'].includes(p?.position)) next.position = p.position;
  if (Number.isFinite(p?.opacity)) next.opacity = Math.min(1, Math.max(0.6, p.opacity));
  if (['ai', 'prices'].includes(p?.mode)) next.mode = p.mode;
  if (typeof p?.tab === 'boolean') next.tab = p.tab;
  if (typeof p?.autoLedger === 'boolean') next.autoLedger = p.autoLedger;
  if (typeof p?.autoPrices === 'boolean') next.autoPrices = p.autoPrices;
  if (typeof p?.shareShots === 'boolean') next.shareShots = p.shareShots;
  if (typeof p?.pinKey === 'string' && p.pinKey !== cur.pinKey) {
    const bad = pinKeyConflict(p.pinKey, cur.hotkey, SHOT_KEY);
    if (bad) return { error: bad, prefs: cur };
    let ok = false;
    try { ok = registerPinKey(p.pinKey); } catch { ok = false; }
    if (!ok) { registerPinKey(cur.pinKey); return { error: `${p.pinKey} не вийшло зайняти — вона вже в іншої програми або недопустима`, prefs: cur }; }
    next.pinKey = p.pinKey;
  }
  if (typeof p?.hotkey === 'string' && p.hotkey !== cur.hotkey) {
    if (p.hotkey.toLowerCase() === String(cur.pinKey).toLowerCase()) return { error: `${p.hotkey} уже ставить мітку — оберіть іншу клавішу.`, prefs: cur };
    let ok = false;
    try { ok = registerHotkey(p.hotkey); } catch { ok = false; }
    if (!ok) { registerHotkey(cur.hotkey); return { error: `${p.hotkey} не вийшло зайняти — вона вже в іншої програми або недопустима`, prefs: cur }; }
    next.hotkey = p.hotkey;
    tray?.setToolTip(`Q-Hub — ${next.hotkey}: швидкий запис`);
  }
  settings.bar = next; saveSettings();
  bar.setOpacity(next.opacity);
  return { prefs: next };
}

/* ---------- «зір» програми (vision.cjs): гроші з HUD → облік, вікна скупників → ціни на сайт ---------- */
const visionLog = () => path.join(dir(), 'vision.log');
let catalogAt = 0, catalogCache = [];
async function visionCatalog() {
  if (Date.now() - catalogAt < 30 * 60e3 && catalogCache.length) return catalogCache;
  const { data, error } = await sb.from('buyer_items').select('buyer_id,item_id,items(name)');
  if (!error) { catalogCache = (data || []).filter(r => r.items).map(r => ({ id: r.item_id, name: r.items.name, buyer_id: r.buyer_id })); catalogAt = Date.now(); }
  return catalogCache;
}
/* кадр екрана гри (основний монітор) у повному розмірі */
async function captureFrame() {
  const d = screen.getPrimaryDisplay();
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  return (srcs.find(s => s.display_id === String(d.id)) || srcs[0])?.thumbnail || null;
}
/* зміни грошей → облік; «Авто ·» у нотатці — щоб такі записи було видно й легко виправити через Alt+Q */
async function autoRecords(recs) {
  const c = settings.character;
  for (const r of recs) {
    if (r.kind === 'transfer') await insertTransfer(c, r.from, r.to, r.amount);
    else await sb.from('transactions').insert({ character_id: c, type: r.type, amount: r.amount, category: r.category, note: ('Авто · ' + r.note).slice(0, 200), source: 'desktop', account: r.account });
  }
  refreshCabinet();
}
/* при вході в гру облік має збігатися з HUD: різниця — коригування; картку ще не розділено — розділити, як ручна звірка */
async function autoBaseline({ cash, bank }) {
  const c = settings.character;
  const [{ data: ch }, { data: tx }] = await Promise.all([
    sb.from('characters').select('start_balance,start_card').eq('id', c).maybeSingle(),
    sb.from('transactions').select('type,amount,account').eq('character_id', c).limit(20000),
  ]);
  if (!ch) return;
  const sgn = t => (t.type === 'in' ? 1 : -1) * Number(t.amount);
  const total = (tx || []).reduce((s, t) => s + sgn(t), Number(ch.start_balance) || 0);
  let card = (tx || []).reduce((s, t) => s + (t.account === 'card' ? sgn(t) : 0), Number(ch.start_card) || 0), cashNow = total - card;
  const fix = (account, diff) => diff && sb.from('transactions').insert({ character_id: c, type: diff > 0 ? 'in' : 'out', amount: Math.abs(diff), category: 'Коригування', note: 'Звірка з HUD гри', source: 'reconcile', account });
  if (!Number(ch.start_card) && !(tx || []).some(t => t.account === 'card')) {
    await sb.from('characters').update({ start_card: bank }).eq('id', c);
    cashNow = total - bank; card = bank;
  } else await fix('card', bank - card);
  await fix('cash', cash - cashNow);
  refreshCabinet();
}
/* ціни скупника → сайт від імені гравця; сервер сам перевіряє межі, ліміт за годину й цикл цін */
async function autoPrices(rows) {
  let ok = 0;
  for (const r of rows) if (!(await sb.from('price_reports').insert({ kind: 'buyer', buyer_id: r.buyer_id, item_id: r.item_id, price: r.price, source: 'desktop' })).error) ok++;
  try { fs.appendFileSync(visionLog(), `${new Date().toISOString()} prices sent ${ok}/${rows.length}\n`); } catch { /* журнал не обов'язковий */ }
  if (ok) pricesAt = 0;   // плашка Alt+Q одразу покаже нові ціни
}
function startVision() {
  try { if (fs.statSync(visionLog()).size > 2e6) fs.writeFileSync(visionLog(), ''); } catch { /* ще немає */ }
  const eye = vision({
    nativeImage, logFile: visionLog(), capture: captureFrame, catalog: visionCatalog,
    active: () => !!settings.session && !!settings.character && prefs().autoLedger !== false,
    prices: () => prefs().autoPrices !== false,
    onRecords: autoRecords, onBaseline: autoBaseline, onPrices: autoPrices,
  });
  setInterval(() => eye.tick(), 2000);
}

/* таймер ігрової сесії: гра запущена — сесія йде, гру закрито — записана (session.cjs) */
function startSessionTimer() {
  const tick = gameSession.tracker({
    running: async () => { const p = await gameSession.processes(); return p ? gameSession.GAME.some(n => p.has(n)) : null; },
    started: gameSession.gameStart,
    now: Date.now,
    character: () => settings.character || null,
    db: {
      start: async (c, at, end) => { const { data } = await sb.from('game_sessions').insert({ character_id: c, started_at: new Date(at).toISOString(), ended_at: new Date(end).toISOString() }).select('id').single(); return data?.id || null; },
      beat: async (id, at) => { await sb.from('game_sessions').update({ ended_at: new Date(at).toISOString() }).eq('id', id); },
      drop: async id => { await sb.from('game_sessions').delete().eq('id', id); },
    },
    load: () => settings.session || null,
    save: v => { settings.session = v; saveSettings(); },
    changed: () => { tray?.setToolTip(settings.session ? 'Q-Hub — гра йде, сесія рахується' : `Q-Hub — ${prefs().hotkey}: швидкий запис`); refreshCabinet(); },
  });
  const run = () => tick().catch(() => {});   // мережа впала — наступна спроба за 10 с
  run(); setInterval(run, 10e3);
}

/* помилка запуску — повідомлення замість тихого виходу без вікна */
const fail = e => { dialog.showErrorBox('Q-Hub не запустився', String(e?.stack || e)); app.quit(); };
process.on('uncaughtException', fail);

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);   // без меню «File / Edit / View» і його гарячих клавіш — це програма, не браузер
  try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; }
  const enc = s => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s));
  const dec = b => (safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString());
  sb = makeClient(cfg, fileStorage(path.join(dir(), 'session.bin'), enc, dec));

  /* оновлені токени — одразу в кабінет, інакше він за годину лишиться з простроченим ключем */
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(() => refreshRole().catch(() => {}), 0);   // F9 — лише для редакторів
    if (!win || !isCabinet(win.webContents.getURL())) return;
    if (ev === 'TOKEN_REFRESHED' || ev === 'SIGNED_IN') tokens().then(t => win.webContents.send('session', t));
    if (ev === 'SIGNED_OUT') { win.webContents.send('session', null); showLogin(); }
  });

  ipcMain.handle('state', () => state());
  ipcMain.handle('session', e => (trusted(e) ? tokens() : null));
  ipcMain.handle('cabinet', () => showCabinet());
  /* «Швидкий запис» у кабінеті відкриває ту саму плашку, що й Alt+Q */
  ipcMain.handle('open-bar', e => { if (trusted(e)) return showBar().then(() => prefs().hotkey); });
  ipcMain.handle('hotkey', e => (trusted(e) ? prefs().hotkey : null));
  ipcMain.handle('login', async () => {
    try { await login(sb, openExternal); win?.show(); win?.focus(); return await state(); }
    catch (e) { return { user: null, error: 'Вхід не вдався: ' + e.message }; }
  });
  ipcMain.handle('logout', async () => {
    await sb.auth.signOut();
    if (isCabinet(win.webContents.getURL())) showLogin();
    return { user: null };
  });
  ipcMain.handle('character', (_e, id) => { if (typeof id === 'string') { settings.character = id; saveSettings(); } return true; });
  ipcMain.handle('site', (_e, p) => openExternal(cfg.site + (typeof p === 'string' && p.startsWith('/') ? p : '/')));
  /* швидкий запис — лише з плашки, не зі сторінок сайту */
  const fromBar = e => bar && e.sender === bar.webContents;
  ipcMain.handle('quick-parse', (e, text) => (fromBar(e) ? quick.parse(text) : null));
  ipcMain.handle('quick-add', (e, text) => (fromBar(e) ? quickAdd(text) : null));
  ipcMain.handle('quick-ask', (e, text) => (fromBar(e) ? quickAsk(text) : null));
  ipcMain.handle('quick-run', e => (fromBar(e) ? quickRun() : null));
  /* плашка росте під відповідь помічника */
  /* плашка росте під вміст; знизу екрана — угору, щоб не вилізти за край */
  ipcMain.handle('quick-size', (e, h) => {
    if (!fromBar(e) || !Number.isFinite(h)) return;
    h = Math.round(Math.min(BAR_MAX_H, Math.max(90, h)));
    const b = bar.getBounds();
    bar.setBounds({ x: b.x, y: prefs().position === 'bottom' ? b.y + b.height - h : b.y, width: BAR_W, height: h });
  });
  ipcMain.handle('bar-data', e => (fromBar(e) ? barData() : null));
  ipcMain.handle('bar-history', e => (fromBar(e) ? barHistory() : null));
  ipcMain.handle('bar-character', (e, id) => (fromBar(e) ? barCharacter(id) : null));
  ipcMain.handle('bar-prefs', (e, p) => (fromBar(e) ? barPrefs(p) : null));
  ipcMain.handle('quick-deal', (e, op, item, qty, price) => (fromBar(e) ? quickDeal(op, item, qty, price) : null));
  ipcMain.handle('shot-label', async (e, name, label, note, share) => {
    if (!fromBar(e) || !shotStore || !shotStore.label(name, label, note)) return { ok: false };
    if (typeof share === 'boolean' && share !== prefs().shareShots) barPrefs({ shareShots: share });
    return { ok: true, shared: share ? await shareShot(name, label, note) : false };
  });
  ipcMain.handle('shots-stats', e => { if (!fromBar(e)) return null; shotStore ??= shots.store(path.join(dir(), 'shots')); return { stats: shotStore.stats(), labels: shots.LABELS, key: SHOT_KEY }; });
  ipcMain.handle('vision-log-open', e => { if (fromBar(e)) shell.openPath(visionLog()); });
  ipcMain.handle('shots-open', e => { if (!fromBar(e)) return; shotStore ??= shots.store(path.join(dir(), 'shots')); shell.openPath(shotStore.dir); });
  ipcMain.handle('bar-cabinet', e => { if (fromBar(e)) { bar.hide(); showMain(); if (!isCabinet(win.webContents.getURL())) showCabinet(); } });
  ipcMain.handle('quick-hide', e => { if (fromBar(e)) bar.hide(); });
  /* F9 без точки: «надіслати без точки» чи «не надсилати» */
  ipcMain.handle('pin-decide', (e, send, hint) => {
    if (!fromBar(e) || !pinAsk) return;
    const a = pinAsk; pinAsk = null; bar.hide(); pinAsk = a;   // hide не має скасувати те, що вибрали
    pinDecide(send === true, hint && typeof hint === 'object' ? hint : {});
  });
  /* кнопка «Оновити» в кабінеті */
  ipcMain.handle('update-state', e => (trusted(e) ? { ...(updates?.state() || { status: 'idle' }), current: app.getVersion() } : null));
  ipcMain.handle('update-install', e => { if (trusted(e)) updates?.install(); });

  createWindow();
  createBar();
  createTray();
  startUpdates();
  startDrafts();
  startSessionTimer();
  startVision();
  if (!globalShortcut.register(SHOT_KEY, () => captureShot().catch(() => {})))
    tray?.displayBalloon?.({ title: 'Q-Hub', content: `${SHOT_KEY} зайнята іншою програмою — навчальні знімки недоступні.` });
  if (!registerHotkey(prefs().hotkey))
    dialog.showErrorBox('Q-Hub', `${prefs().hotkey} уже зайнята іншою програмою — швидкий запис відкривай з іконки в треї або зміни клавішу в налаштуваннях плашки.`);
}).catch(fail);

/* друга копія програми не запускається — просто показує першу (інакше Alt+Q і порти входу зайняті) */
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => win && showMain());
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
