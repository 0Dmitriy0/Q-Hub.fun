/* окреме вікно з правилом (specs/084): вкладки й місце вікна. Чисті функції — тести без Electron (rulewin.test.cjs).
   Стан вкладок тримає головний процес; вікно лише малює те, що отримало (contracts/rule-window.md) */
/* DEF_W — стала ширина прозорого вікна разом з полями під тінь (розмір руками не міняється, як у плашки) */
const MAX_TABS = 5, MIN_W = 280, MIN_H = 140, DEF_W = 420, DEF_H = 300, GAP = 12, SEEN_W = 120, SEEN_H = 60;
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

/* стан: до 5 вкладок (groups), у кожній до 5 правил (rules) — гравець збирає їх перетягуванням (власник 2026-11-14).
   group = { id, at, rules: [пункт] }; active — id вкладки; note — разова примітка */
const MAX_RULES = 5;
const empty = () => ({ groups: [], active: null, note: null });
const gid = (rule, now) => `g${now}:${rule.id}`;
const holder = (st, ruleId) => st.groups.find(g => g.rules.some(r => r.id === ruleId));
/* прибрати порожні вкладки й поправити активну: зникла активна — сусідня праворуч, інакше ліворуч */
function tidy(st, groups, active, note = null) {
  const i = st.groups.findIndex(g => g.id === active);
  const left = groups.filter(g => g.rules.length);
  if (!left.some(g => g.id === active)) active = left.length ? left[Math.min(Math.max(i, 0), left.length - 1)].id : null;
  return { groups: left, active, note };
}
/* «Відкрити окремо»: пункт уже є — його вкладка стає активною; інакше нова вкладка; шоста — замість найстарішої */
function addRule(st, rule, now = Date.now()) {
  if (!rule) return st;
  const has = holder(st, rule.id);
  if (has) return { ...st, active: has.id, note: null };
  let groups = st.groups, note = null;
  if (groups.length >= MAX_TABS) {
    const old = groups.reduce((a, b) => (b.at < a.at ? b : a));
    groups = groups.filter(g => g !== old);
    note = `Відкрито ${MAX_TABS} вкладок — найстарішу закрито`;
  }
  const g = { id: gid(rule, now), at: now, rules: [rule] };
  return { groups: [...groups, g], active: g.id, note };
}
function activate(st, id) {
  return st.groups.some(g => g.id === id) ? { ...st, active: id, note: null } : st;
}
/* «×» на вкладці — уся вкладка з її правилами */
function closeGroup(st, id) {
  if (!st.groups.some(g => g.id === id)) return st;
  return tidy(st, st.groups.map(g => (g.id === id ? { ...g, rules: [] } : g)), st.active);
}
/* «×» на правилі — лише воно; вкладка без правил зникає */
function removeRule(st, ruleId) {
  if (!holder(st, ruleId)) return st;
  return tidy(st, st.groups.map(g => ({ ...g, rules: g.rules.filter(r => r.id !== ruleId) })), st.active);
}
/* перетягування: src — { rule } (одне правило) або { group } (уся вкладка);
   to — { group, anchor?, pos? } (у вкладку: вище/нижче правила anchor, без нього — у кінець) або { newGroup: true } (нова вкладка).
   Більше 5 правил у вкладці чи 6-та вкладка — нічого не міняється, лише примітка */
function move(st, src, to, now = Date.now()) {
  const from = src?.group ? st.groups.find(g => g.id === src.group) : src?.rule ? holder(st, src.rule) : null;
  if (!from || !to) return st;
  const moving = src.group ? from.rules : from.rules.filter(r => r.id === src.rule);
  const ids = new Set(moving.map(r => r.id));
  const stripped = st.groups.map(g => ({ ...g, rules: g.rules.filter(r => !ids.has(r.id)) }));
  if (to.newGroup) {
    if (src.group || (from.rules.length === 1)) return st;   // вкладку саму в себе — нічого не міняється
    if (stripped.filter(g => g.rules.length).length >= MAX_TABS) return { ...st, note: `Уже ${MAX_TABS} вкладок — перенеси в наявну` };
    const g = { id: gid(moving[0], now), at: now, rules: moving };
    return tidy(st, [...stripped, g], g.id);
  }
  const ti = stripped.findIndex(g => g.id === to.group);
  if (ti < 0) return st;
  const rest = stripped[ti].rules;
  if (rest.length + moving.length > MAX_RULES) return { ...st, note: `У вкладці може бути до ${MAX_RULES} правил` };
  let at = rest.findIndex(r => r.id === to.anchor);
  at = at < 0 ? rest.length : at + (to.pos === 'after' ? 1 : 0);
  stripped[ti] = { ...stripped[ti], rules: [...rest.slice(0, at), ...moving, ...rest.slice(at)] };
  return tidy(st, stripped, to.group);
}

/* розмір у межах: не менше заголовка з трьома рядками, не більше половини робочої області; рамка — всередині області */
/* frac — частка висоти робочої області: одне правило у вкладці — половина, кілька — більше (ALL_FRAC) */
function fit(r, work, frac = 0.5) {
  const maxW = Math.max(MIN_W, Math.floor(work.width / 2)), maxH = Math.max(MIN_H, Math.floor(work.height * frac));
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
/* висота під вміст: не менше заголовка з трьома рядками, не більше половини робочої області */
const ALL_FRAC = 0.85;
const fitH = (h, work, frac = 0.5) => Math.round(Math.min(Math.max(MIN_H, Math.floor(work.height * frac)), Math.max(MIN_H, Number(h) || DEF_H)));
/* де стоїть вікно: збережене місце { x, y }, якщо вікно там видно; інакше праворуч біля краю, на рівні верху плашки
   (без плашки — 15 % висоти). Ширина стала, висота — поточна (під пункт). work — робоча область монітора, bar — рамка плашки чи null */
function place({ work, bar = null, saved = null, height = DEF_H }) {
  const h = fitH(height, work);
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const r = { x: saved.x, y: saved.y, width: DEF_W, height: h };
    if (seen(r, work)) return fit(r, work);
  }
  const y = bar ? bar.y : work.y + Math.round(work.height * 0.15);
  return fit({ x: work.x + work.width - DEF_W - GAP, y, width: DEF_W, height: h }, work);
}

module.exports = { MAX_TABS, MAX_RULES, MIN_W, MIN_H, DEF_W, ALL_FRAC, fitH, cleanHit, empty, addRule, activate, closeGroup, removeRule, move, fit, place, okRect };
