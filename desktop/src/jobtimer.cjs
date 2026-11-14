/* Таймер заробітку на роботі (specs/086): ручний вимір — гравець сам вмикає й зупиняє.
   Рахує чистий час (без пауз) і суму зростань балансу HUD (готівка + картка), як сеанс (sessionmoney.cjs),
   але окремо від нього: цифри сеансу таймер не чіпає (FR-012).
   Вимір — звичайний об'єкт (серіалізується в settings.jobTimer і jobtimer.json); функції змінюють його на місці.
   Підпис: робота з довідника + рівень навички, власний замір чи без підпису (data-model.md).
   Пропозиція в довідник: текст заробітку зводиться з поточним по рівнях (mergePay, contracts/wage-proposal.md).
   Окремо від main.cjs, щоб перевірити тестом без Electron. */
const crypto = require('node:crypto');

const MIN_MS = 60e3;           // коротше хвилини «за годину» ще ненадійне (FR-005)
const PROPOSE_MS = 10 * 60e3;  // для довідника — від 10 хв чистого часу (FR-014)
const BLIND_MS = 15e3;         // довше без зчитувань — «баланс не видно» (research.md R3)
const MAX_JUMP = 5e6;          // типовий поріг стрибка, поки програма не прочитала money_rules
const MAX_HISTORY = 200;
/* Помилки зчитування OCR (research.md R12): цифра на мить читається неправильно (банк 1 538 292 → 3 538 292) і повертається.
   Готівку й банк розбираємо окремо — помилка сидить в одному полі, і її повернення там точне, навіть якщо друге поле
   в ту ж мить змінилось по-справжньому. Коливання, що за REVERT_MS повертається на ту саму суму (±10 %), — не заробіток.
   Велике зростання (від BIG) не рахується одразу: CONFIRM_MS чекає, чи не повернеться; лишилось — враховуємо */
const REVERT_MS = 60e3;
const BIG = 100e3;
const CONFIRM_MS = 90e3;
const LOG_MAX = 12;           // останні зміни балансу у вимірі — показати гравцю, що враховано
const H = 36e5;
const STATES = ['wait', 'run', 'pause', 'done'];
const ACCS = ['cash', 'bank'];

const accs = money => ({ cash: Number(money?.cash) || 0, bank: Number(money?.bank) || 0 });
const near = (x, y) => x >= y * 0.9 && x <= y * 1.1;

function create(char, now, id = crypto.randomUUID()) {
  return { id, char: char || '', state: 'wait', startedAt: now, runMs: 0, runFrom: null, last: null, lastAt: null, seen: null,
    acc: null, seenAcc: null, st: { cash: {}, bank: {} }, pend: [],
    gain: 0, flag: false, blindMs: 0, interrupted: false, label: null, endedAt: null, sent: null, savedAt: now, log: [], fixes: 0 };
}

function logIt(m, e) {
  m.log.push(e);
  if (m.log.length > LOG_MAX) m.log.splice(0, m.log.length - LOG_MAX);
}
/* великі зростання, що за CONFIRM_MS не повернулись, — враховуємо */
function confirm(m, now) {
  const ok = m.pend.filter(p => now - p.at >= CONFIRM_MS);
  if (!ok.length) return;
  m.pend = m.pend.filter(p => now - p.at < CONFIRM_MS);
  for (const p of ok) { m.gain += p.add; logIt(m, { at: now, acc: p.acc, d: p.add, add: p.add, kind: 'gain' }); }
}
/* неправдоподібний стрибок, що за REVERT_MS повернувся до попереднього значення (±1 %), — помилка зчитування
   (готівка 244 333 → 24 433 308 → 244 333): позначку «сумнівний» знімаємо; дрібна різниця після повернення — звичайна зміна */
function jumpBack(m, acc, d, at) {
  const st = m.st[acc], j = st?.jump;
  if (!j || at - j.at > REVERT_MS) return null;
  const now = m.acc[acc] + d;
  if (Math.abs(now - j.from) > Math.max(1000, Math.abs(j.from) * 0.01)) return null;
  st.jump = null;
  m.jumpsOpen = Math.max(0, (m.jumpsOpen || 1) - 1);
  if (!m.jumpsOpen && !m.pendFlag) m.flag = false;
  m.fixes++;
  logIt(m, { at, acc, d, add: 0, kind: 'fix' });
  return now - j.from;   // справжня зміна поля за цей час (напр. +1 489 заробітку)
}
function delta(m, acc, d, at, maxJump) {
  const st = (m.st[acc] ??= {});
  const rest = jumpBack(m, acc, d, at);
  if (rest !== null) { if (rest) delta(m, acc, rest, at, maxJump); return; }
  if (Math.abs(d) > maxJump) {
    m.flag = true; m.jumpsOpen = (m.jumpsOpen || 0) + 1;
    st.dip = st.inc = null; st.jump = { from: m.acc[acc], at };
    logIt(m, { at, acc, d, add: 0, kind: 'jump' });
    return;
  }
  if (d > 0) {
    /* просідання цього поля, що повернулось на ту саму суму, — помилка зчитування (витрата, а потім інший заробіток — рахується) */
    if (st.dip && at - st.dip.at <= REVERT_MS && near(d, st.dip.d)) { st.dip = null; m.fixes++; logIt(m, { at, acc, d, add: 0, kind: 'fix' }); return; }
    st.dip = null;
    if (d >= BIG) { m.pend.push({ acc, add: d, at }); logIt(m, { at, acc, d, add: 0, kind: 'hold' }); return; }
    m.gain += d; st.inc = { add: d, at };
    logIt(m, { at, acc, d, add: d, kind: 'gain' });
    return;
  }
  /* зниження, що повертає непідтверджений великий стрибок цього поля, — його й не було */
  const i = m.pend.findIndex(p => p.acc === acc && near(-d, p.add));
  if (i >= 0) { m.pend.splice(i, 1); m.fixes++; logIt(m, { at, acc, d, add: 0, kind: 'fix' }); return; }
  /* недавнє зростання цього поля, що повернулось назад, — знімаємо */
  if (st.inc && at - st.inc.at <= REVERT_MS && near(-d, st.inc.add)) {
    m.gain -= st.inc.add; m.fixes++; logIt(m, { at, acc, d, add: -st.inc.add, kind: 'fix' }); st.inc = null; return;
  }
  st.inc = null;
  st.dip = { d: -d, at };
  logIt(m, { at, acc, d, add: 0, kind: 'spend' });
}

/* стабільне зчитування балансу; у паузі лише запам'ятовується — для продовження */
function update(m, money, at, maxJump = MAX_JUMP) {
  if (!m || !money) return m;
  const a = accs(money), t = a.cash + a.bank;
  m.log ??= []; m.fixes ??= 0; m.pend ??= []; m.st ??= { cash: {}, bank: {} };
  if (m.state === 'wait') { Object.assign(m, { state: 'run', runFrom: at, last: t, lastAt: at, seen: t, acc: a, seenAcc: a }); return m; }
  if (m.state === 'pause') { Object.assign(m, { seen: t, seenAcc: a }); return m; }
  if (m.state !== 'run') return m;
  const gap = at - (m.lastAt ?? at);
  if (gap > BLIND_MS) m.blindMs += gap - BLIND_MS;
  confirm(m, at);
  if (m.acc) for (const k of ACCS) { const d = a[k] - m.acc[k]; if (d) delta(m, k, d, at, maxJump); }
  Object.assign(m, { last: t, lastAt: at, seen: t, acc: a, seenAcc: a });
  return m;
}

const runMsAt = (m, now) => m.runMs + (m.state === 'run' && m.runFrom != null ? Math.max(0, now - m.runFrom) : 0);

function pause(m, now) {
  if (m?.state !== 'run') return m;
  Object.assign(m, { runMs: runMsAt(m, now), runFrom: null, state: 'pause' });
  return m;
}
function resume(m, now) {
  if (m?.state !== 'pause') return m;
  /* зміни балансу за паузу не рахуються: продовжуємо з останнього побаченого; проміжок «не видно» — від продовження */
  Object.assign(m, { state: 'run', runFrom: now, last: m.seen ?? m.last, acc: m.seenAcc ?? m.acc ?? null, lastAt: now, interrupted: false });
  m.st = { cash: {}, bank: {} };   // коливання до паузи з тим, що після, не зводимо
  if (m.last == null) m.state = 'wait';
  return m;
}
/* стоп: підтверджені великі зростання — враховуємо; ще не підтверджені — ні, а вимір позначаємо сумнівним */
function stop(m, now) {
  if (!m || m.state === 'done') return m;
  if (m.state === 'run' && m.pend?.length) {
    confirm(m, now);
    if (m.pend.length) { m.flag = true; m.pendFlag = true; for (const p of m.pend) logIt(m, { at: now, acc: p.acc, d: p.add, add: 0, kind: 'jump' }); m.pend = []; }
  }
  Object.assign(m, { runMs: runMsAt(m, now), runFrom: null, state: 'done', endedAt: now });
  return m;
}
/* сума, що ще чекає підтвердження (для вікна: «перевіряю +…») */
const pending = m => (m?.pend || []).reduce((s, p) => s + p.add, 0);
/* стоп до першого балансу — порожній вимір, у історію не йде (U2) */
const isEmpty = m => !m || m.last == null;

const blind = (m, now) => m?.state === 'run' && m.lastAt != null && now - m.lastAt > BLIND_MS;

function perHour(m, now = m?.endedAt ?? Date.now()) {
  if (!m) return null;
  const ms = runMsAt(m, now);
  return ms >= MIN_MS ? Math.round(m.gain / (ms / H)) : null;
}

const touch = (m, now) => { if (m) m.savedAt = now; return m; };
const state = m => (m ? JSON.parse(JSON.stringify(m)) : null);

/* після перезапуску: відлік — на паузу з позначкою «перервано»; час рахуємо лише до останнього збереження
   чи зчитування, а не до зараз — інакше ніч із закритою програмою стала б «роботою» (U1) */
function restore(saved, now) {
  if (!saved || typeof saved !== 'object' || !STATES.includes(saved.state) || typeof saved.id !== 'string') return null;
  const m = { ...create(saved.char, saved.startedAt ?? now, saved.id), ...saved };
  if (m.state === 'run') {
    const end = Math.min(now, Math.max(m.lastAt ?? 0, m.savedAt ?? 0, m.runFrom ?? 0));
    Object.assign(m, { runMs: m.runMs + Math.max(0, end - (m.runFrom ?? end)), runFrom: null, state: 'pause', interrupted: true });
  }
  return m;
}

/* ---------- підпис (FR-009) ---------- */
/* роботи, де заробіток залежить не від рівня, а від того, на чому саме заробляв (власник 2026-11-14): варіант замість рівня */
const VARIANTS = { farmer: ['Пшениця', 'Гарбузи', 'Капуста', 'Яйця', 'Апельсини', 'Молоко'] };

function cleanLabel(x) {
  if (x == null) return { ok: true, label: null };
  if (x.kind === 'job') {
    const id = typeof x.id === 'string' ? x.id.trim() : '';
    if (!id) return { ok: false, error: 'Обери роботу зі списку' };
    const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 80) : id;
    if (VARIANTS[id]) {
      const v = x.variant == null || x.variant === '' ? null : x.variant;
      if (v !== null && !VARIANTS[id].includes(v)) return { ok: false, error: 'Обери, що саме збирав, зі списку' };
      return { ok: true, label: { kind: 'job', id, name, level: null, variant: v } };
    }
    const lv = x.level;
    if (lv === null || lv === undefined || lv === '') return { ok: true, label: { kind: 'job', id, name, level: null, variant: null } };
    if (typeof lv !== 'number' || !Number.isInteger(lv) || lv < 1 || lv > 100) return { ok: false, error: 'Рівень — ціле число від 1 до 100' };
    return { ok: true, label: { kind: 'job', id, name, level: lv, variant: null } };
  }
  if (x.kind === 'own') {
    const name = typeof x.name === 'string' ? x.name.trim().slice(0, 60) : '';
    if (!name) return { ok: false, error: 'Напиши назву заміру' };
    return { ok: true, label: { kind: 'own', name } };
  }
  return { ok: false, error: 'Невідомий підпис' };
}

function groupKey(l) {
  if (!l) return 'none';
  return l.kind === 'job' ? `job:${l.id}:${l.variant ?? l.level ?? '-'}` : `own:${l.name.trim().toLowerCase()}`;
}
function groupTitle(l) {
  if (!l) return 'Без підпису';
  if (l.kind !== 'job') return l.name;
  if (VARIANTS[l.id]) return `${l.name} · ${l.variant || 'що саме — не вказано'}`;
  return `${l.name} · ${l.level ? 'рівень ' + l.level : 'рівень не вказано'}`;
}
/* частина тексту заробітку в довіднику: «Пшениця» чи «Рівень 3» */
const partKey = l => (l.variant ? l.variant : `Рівень ${l.level}`);

/* ---------- історія (FR-010) ---------- */
const historyAdd = (items, m, max = MAX_HISTORY) => [state(m), ...(items || []).filter(x => x.id !== m.id)].slice(0, max);
const historyRemove = (items, id) => (items || []).filter(x => x.id !== id);
function historyRelabel(items, id, label) {
  const it = (items || []).find(x => x.id === id);
  if (!it) return { ok: false, error: 'Виміру немає' };
  if (it.sent) return { ok: false, error: 'Вимір уже надіслано в довідник — підпис не змінити' };
  const c = cleanLabel(label);
  if (!c.ok) return c;
  return { ok: true, items: items.map(x => (x.id === id ? { ...x, label: c.label } : x)) };
}
/* середнє по групі: Σзаробітку ÷ Σчасу; короткі (< 1 хв) і сумнівні не входять; порядок — за останнім виміром */
function historyGroups(items) {
  const map = new Map();
  for (const m of items || []) {
    const key = groupKey(m.label);
    if (!map.has(key)) map.set(key, { key, title: groupTitle(m.label), label: m.label, n: 0, all: 0, runMs: 0, gain: 0, perHour: null });
    const g = map.get(key);
    g.all++;
    if (m.runMs >= MIN_MS && !m.flag) { g.n++; g.runMs += m.runMs; g.gain += m.gain; }
  }
  return [...map.values()].map(g => ({ ...g, perHour: g.runMs >= MIN_MS ? Math.round(g.gain / (g.runMs / H)) : null }));
}

/* ---------- пропозиція в довідник (FR-014…FR-017) ---------- */
/* '' — можна; інакше причина (порядок перевірки — data-model.md) */
function canPropose(m, ctx = {}) {
  if (!m) return 'no-label';
  if (m.sent) return 'sent';
  const l = m.label;
  if (!l) return 'no-label';
  if (l.kind === 'own') return 'own';
  if (VARIANTS[l.id] ? !l.variant : l.level == null) return VARIANTS[l.id] ? 'no-variant' : 'no-level';
  if (ctx.jobIds && !ctx.jobIds.has(l.id)) return 'gone';
  if (m.state !== 'done' || m.runMs < PROPOSE_MS) return 'short';
  if (m.flag) return 'flag';
  if (ctx.login === false) return 'login';
  if (ctx.online === false) return 'offline';
  return '';
}

const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const roundRate = v => (v >= 10000 ? Math.floor(v / 100) * 100 : Math.round(v));
const kyivDate = ms => new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric' }).format(ms);
const minutes = m => Math.round(m.runMs / 60e3);

function payPart(m) {
  return `${partKey(m.label)}: ≈${fmt(roundRate(perHour(m) || 0))} $/год (вимір ${minutes(m)} хв, ${kyivDate(m.endedAt ?? m.startedAt)})`;
}

/* поле заробітку в довіднику одне на роботу: замінюємо частину свого рівня (число) чи варіанту («Пшениця») або дописуємо нову,
   решту не чіпаємо. Рівні — наприкінці за зростанням; варіант — на своєму місці чи в кінець решти тексту */
const LEVEL = /^Рівень\s+(\d+)\s*:/i;
function mergePay(cur, key, part) {
  const parts = String(cur || '').split(/\s+·\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const other = parts.filter(p => !LEVEL.test(p));
  const levels = new Map(parts.filter(p => LEVEL.test(p)).map(p => [Number(LEVEL.exec(p)[1]), p]));
  if (typeof key === 'number') levels.set(key, part);
  else {
    const k = String(key).trim().toLowerCase() + ':';
    const i = other.findIndex(p => p.toLowerCase().startsWith(k));
    if (i >= 0) other[i] = part; else other.push(part);
  }
  const pay = [...other, ...[...levels].sort((a, b) => a[0] - b[0]).map(([, p]) => p)].join(' · ');
  return pay.length > 300 ? { pay: part, tooLong: true } : { pay, tooLong: false };
}

function sourceNote(m, tooLong) {
  const l = m.label;
  const lv = l?.variant ? `${l.variant}, ` : l?.level != null ? `рівень ${l.level}, ` : '';
  const note = `Таймер Q-Hub: ${lv}${minutes(m)} хв чистого часу, +${fmt(m.gain)} $, ${fmt(perHour(m) || 0)} $/год; `
    + `${m.flag ? 'був сумнівний стрибок балансу' : 'сумнівних стрибків немає'}; баланс не видно ${Math.round((m.blindMs || 0) / 60e3)} хв.`
    + (tooLong ? ' Текст довідника задовгий — звести вручну.' : '');
  const id = ` id:${m.id}`;
  return note.slice(0, 300 - id.length) + id;
}

module.exports = {
  create, update, runMsAt, pause, resume, stop, isEmpty, blind, perHour, pending, touch, state, restore,
  cleanLabel, groupKey, groupTitle, historyAdd, historyRemove, historyRelabel, historyGroups,
  canPropose, payPart, mergePay, sourceNote, fmt, partKey, VARIANTS,
  MIN_MS, PROPOSE_MS, BLIND_MS, MAX_JUMP, MAX_HISTORY, REVERT_MS, BIG, CONFIRM_MS, LOG_MAX,
};
