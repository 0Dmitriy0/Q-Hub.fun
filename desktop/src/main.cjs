/* Q-Hub Desktop — головний процес: вхід, сесія, вибір персонажа. Далі тут з'являться Alt+Q і баланс з екрана. */
const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const cfg = require('./config.json');
const { makeClient, login } = require('./auth.cjs');
const { fileStorage } = require('./store.cjs');

let sb, win, settings = {};
const dir = () => app.getPath('userData');
const settingsFile = () => path.join(dir(), 'settings.json');
const saveSettings = () => fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));

/* лише адреси сайту й Discord відкриваються в браузері; все інше — ні */
const openExternal = url => { if (/^https:\/\//.test(url)) shell.openExternal(url); };
/* сторінки сайту q-hub.fun відкриваються у вікні програми (кабінет), решта — у браузері */
const isSite = url => url === cfg.site || url.startsWith(cfg.site + '/');
/* токени — лише нашому вікну входу та сторінкам сайту */
const trusted = e => { const u = e.senderFrame?.url || ''; return u.startsWith('file:') || isSite(u); };

/* сесія для кабінету: оновлює її лише програма, сторінка отримує готові токени */
async function tokens() {
  const { data: { session } } = await sb.auth.getSession();
  return session ? { access_token: session.access_token, refresh_token: session.refresh_token, character: settings.character || null } : null;
}

function showLogin() {
  win.setResizable(false); win.setMinimumSize(420, 560); win.setSize(420, 560); win.center();
  win.loadFile(path.join(__dirname, 'index.html'));
}
function showCabinet() {
  win.setResizable(true); win.setMinimumSize(800, 600); win.setSize(1280, 820); win.center();
  win.loadURL(cfg.site + '/kabinet');
}

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
    width: 420, height: 560, resizable: false, title: 'Q-Hub', backgroundColor: '#111214', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!isSite(url)) { e.preventDefault(); openExternal(url); } });
  showLogin();
}

/* помилка запуску — повідомлення замість тихого виходу без вікна */
const fail = e => { dialog.showErrorBox('Q-Hub не запустився', String(e?.stack || e)); app.quit(); };
process.on('uncaughtException', fail);

app.whenReady().then(() => {
  try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; }
  const enc = s => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s));
  const dec = b => (safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString());
  sb = makeClient(cfg, fileStorage(path.join(dir(), 'session.bin'), enc, dec));

  /* оновлені токени — одразу в кабінет, інакше він за годину лишиться з простроченим ключем */
  sb.auth.onAuthStateChange((ev) => {
    if (!win || !isSite(win.webContents.getURL())) return;
    if (ev === 'TOKEN_REFRESHED' || ev === 'SIGNED_IN') tokens().then(t => win.webContents.send('session', t));
    if (ev === 'SIGNED_OUT') { win.webContents.send('session', null); showLogin(); }
  });

  ipcMain.handle('state', () => state());
  ipcMain.handle('session', e => (trusted(e) ? tokens() : null));
  ipcMain.handle('cabinet', () => showCabinet());
  ipcMain.handle('login', async () => {
    try { await login(sb, openExternal); win?.show(); win?.focus(); return await state(); }
    catch (e) { return { user: null, error: 'Вхід не вдався: ' + e.message }; }
  });
  ipcMain.handle('logout', async () => {
    await sb.auth.signOut();
    if (isSite(win.webContents.getURL())) showLogin();
    return { user: null };
  });
  ipcMain.handle('character', (_e, id) => { if (typeof id === 'string') { settings.character = id; saveSettings(); } return true; });
  ipcMain.handle('site', (_e, p) => openExternal(cfg.site + (typeof p === 'string' && p.startsWith('/') ? p : '/')));
  createWindow();
}).catch(fail);

app.on('window-all-closed', () => app.quit());
