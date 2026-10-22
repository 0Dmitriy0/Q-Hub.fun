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
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'index.html'));
}

/* помилка запуску — повідомлення замість тихого виходу без вікна */
const fail = e => { dialog.showErrorBox('Q-Hub не запустився', String(e?.stack || e)); app.quit(); };
process.on('uncaughtException', fail);

app.whenReady().then(() => {
  try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; }
  const enc = s => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s));
  const dec = b => (safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString());
  sb = makeClient(cfg, fileStorage(path.join(dir(), 'session.bin'), enc, dec));

  ipcMain.handle('state', () => state());
  ipcMain.handle('login', async () => {
    try { await login(sb, openExternal); win?.show(); win?.focus(); return await state(); }
    catch (e) { return { user: null, error: 'Вхід не вдався: ' + e.message }; }
  });
  ipcMain.handle('logout', async () => { await sb.auth.signOut(); return { user: null }; });
  ipcMain.handle('character', (_e, id) => { settings.character = id; saveSettings(); return true; });
  ipcMain.handle('site', (_e, p) => openExternal(cfg.site + (typeof p === 'string' && p.startsWith('/') ? p : '/')));
  createWindow();
}).catch(fail);

app.on('window-all-closed', () => app.quit());
