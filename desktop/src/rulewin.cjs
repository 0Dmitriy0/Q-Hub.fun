/* окреме вікно з правилом (specs/084): вкладки й місце вікна. Чисті функції — тести без Electron (rulewin.test.cjs).
   Стан вкладок тримає головний процес; вікно лише малює те, що отримало (contracts/rule-window.md) */
const MAX_TABS = 5, MIN_W = 280, MIN_H = 160, DEF_W = 380, DEF_H = 300, GAP = 12, SEEN_W = 120, SEEN_H = 60;
const KINDS = ['rules', 'law', 'order', 'info'];
const FORUM = 'https://forum.quant5.com.ua/';

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
/* пункт із плашки → вкладка: лише потрібні поля в межах (data-model.md); без тексту — null */
function cleanHit(h, now = Date.now()) {
  if (!h || typeof h !== 'object') return null;
  const t = { topic: str(h.topic, 300), url: '', kind: KINDS.includes(h.kind) ? h.kind : 'rules', n: str(h.n, 40), h: str(h.h, 300), s: str(h.s, 8000), at: now };
  if (!t.s.trim()) return null;
  if (typeof h.url === 'string' && h.url.startsWith(FORUM)) t.url = h.url.slice(0, 500);
  t.id = `${t.topic}|${t.n}|${t.h}`;
  return t;
}

const empty = () => ({ tabs: [], active: null, note: null });
/* новий пункт: той самий — лише активний; шостий — замість найстарішого, з приміткою */
function addTab(st, tab) {
  if (!tab) return st;
  if (st.tabs.some(t => t.id === tab.id)) return { ...st, active: tab.id, note: null };
  let tabs = st.tabs, note = null;
  if (tabs.length >= MAX_TABS) {
    const old = tabs.reduce((a, b) => (b.at < a.at ? b : a));
    tabs = tabs.filter(t => t !== old);
    note = `Відкрито ${MAX_TABS} — найстаріше закрито`;
  }
  return { tabs: [...tabs, tab], active: tab.id, note };
}
function activate(st, id) {
  return st.tabs.some(t => t.id === id) ? { ...st, active: id, note: null } : st;
}
/* закрили активну — активна сусідня праворуч, інакше ліворуч; остання — порожньо (вікно ховається) */
function closeTab(st, id) {
  const i = st.tabs.findIndex(t => t.id === id);
  if (i < 0) return st;
  const tabs = st.tabs.filter(t => t.id !== id);
  let active = st.active;
  if (active === id) active = tabs.length ? tabs[Math.min(i, tabs.length - 1)].id : null;
  return { tabs, active, note: null };
}

/* розмір у межах: не менше заголовка з трьома рядками, не більше половини робочої області; рамка — всередині області */
function fit(r, work) {
  const maxW = Math.max(MIN_W, Math.floor(work.width / 2)), maxH = Math.max(MIN_H, Math.floor(work.height / 2));
  const width = Math.round(Math.min(maxW, Math.max(MIN_W, r.width))), height = Math.round(Math.min(maxH, Math.max(MIN_H, r.height)));
  const x = Math.round(Math.min(work.x + work.width - width, Math.max(work.x, r.x)));
  const y = Math.round(Math.min(work.y + work.height - height, Math.max(work.y, r.y)));
  return { x, y, width, height };
}
const okRect = r => r && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k])) && r.width > 0 && r.height > 0;
/* скільки збереженої рамки видно в робочій області */
function seen(r, work) {
  const w = Math.min(r.x + r.width, work.x + work.width) - Math.max(r.x, work.x);
  const h = Math.min(r.y + r.height, work.y + work.height) - Math.max(r.y, work.y);
  return w >= SEEN_W && h >= SEEN_H;
}
/* де стоїть вікно: збережене, якщо його видно; інакше праворуч біля краю, на рівні верху плашки (без плашки — 15 % висоти).
   work — робоча область монітора (збереженого або плашки), bar — рамка плашки чи null */
function place({ work, bar = null, saved = null }) {
  if (okRect(saved) && seen(saved, work)) return fit(saved, work);
  const y = bar ? bar.y : work.y + Math.round(work.height * 0.15);
  return fit({ x: work.x + work.width - DEF_W - GAP, y, width: DEF_W, height: DEF_H }, work);
}

module.exports = { MAX_TABS, MIN_W, MIN_H, cleanHit, empty, addTab, activate, closeTab, fit, place, okRect };
