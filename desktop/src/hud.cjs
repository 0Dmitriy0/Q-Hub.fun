/* «Зір» програми, крок 1: гроші з HUD гри QuantRP. Вгорі праворуч завжди видно готівку «$3 820 037» і під нею
   банк «🏛 $3 162 623»; при зміні поруч на кілька секунд з'являється значок «−299 $» (червоний) чи «+100 $» (зелений).
   Програма раз на 2 с читає цю ділянку (OCR лише цифр) і з різниці між стабільними показами робить записи обліку.
   Тут — чиста логіка без Electron і OCR, щоб її можна було перевірити тестами (hud.test.cjs). */

/* ділянка з грошима для екрана w×h (прямокутник Electron { x, y, width, height }): HUD прив'язаний до правого краю й масштабується з висотою (виміряно на 1920×1080).
   k — додатковий масштаб HUD: на 3840×2160 у гравця HUD більший за «висота / 1080» приблизно на 8 % (k ≈ 1,08; знімки 2026-11-16) —
   з k = 1 ділянка відрізала «$1» зліва й низ рядка банку */
function region(w, h, k = 1) {
  const s = h / 1080 * k;
  return { x: Math.round(w - 342 * s), y: Math.round(76 * s), width: Math.round(140 * s), height: Math.round(52 * s) };
}
/* ширша ділянка — там, де з'являються значки зміни (праворуч від цифр) */
function badgeRegion(w, h, k = 1) {
  const s = h / 1080 * k;
  return { x: Math.round(w - 342 * s), y: Math.round(66 * s), width: Math.round(180 * s), height: Math.round(62 * s) };
}
/* масштаби HUD, які пробуємо, коли гроші не читаються: 1 — як завжди (1080p, 1440p), далі — більший HUD (4K) */
const HUD_SCALES = [1, 1.08, 1.04, 1.12];
/* порядок спроб: спершу масштаб, що спрацював минулого разу */
const scaleOrder = last => [last, ...HUD_SCALES.filter(k => k !== last)];

/* текст OCR → { cash, bank } або null. Рядки «$3 820 037» і «$3 162 623»; усе інше (меню закрило HUD, сміття) — null */
function parse(text) {
  const nums = String(text || '').split(/\n/).map(l => l.replace(/\s/g, '')).filter(Boolean)
    .map(l => (/^\$\d{1,10}$/.test(l) ? Number(l.slice(1)) : null));
  if (nums.length !== 2 || nums.some(n => n === null)) return null;
  return { cash: nums[0], bank: nums[1] };
}

/* чи видно значок зміни: червоний чи зелений фон серед пікселів BGRA (Electron nativeImage.toBitmap) */
function hasBadge(bgra, minPixels = 25) {
  let n = 0;
  for (let i = 0; i + 3 < bgra.length; i += 4) {
    const b = bgra[i], g = bgra[i + 1], r = bgra[i + 2];
    if ((r > 150 && g < 90 && b < 90) || (g > 130 && r < 110 && b < 110 && g - r > 40)) if (++n >= minPixels) return true;
  }
  return false;
}

/* зміна між двома стабільними показами → дії обліку.
   Готівка −X і банк +X одночасно — переказ; інакше окремо прибуток/витрата на кожному рахунку */
function classify(prev, next) {
  const dc = next.cash - prev.cash, db = next.bank - prev.bank;
  if (!dc && !db) return [];
  if (dc && db && dc === -db) return [{ kind: 'transfer', from: dc < 0 ? 'cash' : 'card', to: dc < 0 ? 'card' : 'cash', amount: Math.abs(dc) }];
  const out = [];
  if (dc) out.push({ kind: 'tx', type: dc > 0 ? 'in' : 'out', amount: Math.abs(dc), account: 'cash' });
  if (db) out.push({ kind: 'tx', type: db > 0 ? 'in' : 'out', amount: Math.abs(db), account: 'card' });
  return out;
}

/* спостерігач: приймає покази (або null, коли HUD не видно чи висить значок) і повертає дії, коли новий показ
   двічі поспіль однаковий. Неправдоподібні стрибки (OCR зʼїв цифру) — відкидаються */
function watcher({ maxJump = 50e6 } = {}) {
  let stable = null, cand = null;
  function feed(r) {
    if (!r) { cand = null; return []; }
    if (!stable) { if (cand && cand.cash === r.cash && cand.bank === r.bank) { stable = r; cand = null; } else cand = r; return []; }
    if (r.cash === stable.cash && r.bank === stable.bank) { cand = null; return []; }
    if (Math.abs(r.cash - stable.cash) > maxJump || Math.abs(r.bank - stable.bank) > maxJump) { cand = null; return []; }
    if (!cand || cand.cash !== r.cash || cand.bank !== r.bank) { cand = r; return []; }
    const acts = classify(stable, r);
    stable = r; cand = null;
    return acts;
  }
  /* останній стабільний показ — для звірки з обліком при вході в гру */
  Object.defineProperty(feed, 'stable', { get: () => stable });
  return feed;
}

module.exports = { region, badgeRegion, HUD_SCALES, scaleOrder, parse, hasBadge, classify, watcher };
