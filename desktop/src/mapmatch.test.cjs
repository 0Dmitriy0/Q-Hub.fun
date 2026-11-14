const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mm = require('./mapmatch.cjs');
const { decodePng } = require('./fixtures/png.cjs');

/* еталон — той самий файл, що віддає сайт */
const GAME = path.join(__dirname, '..', '..', 'public', 'map', 'game');
const ref = mm.parseRef(fs.readFileSync(path.join(GAME, 'export.bin')), JSON.parse(fs.readFileSync(path.join(GAME, 'export.json'), 'utf8')));
const cache = {};

/* штучний «знімок великої карти» 1920×1080: шматок еталона, у центрі екрана (хрестик) — точка (cx, cy) метрів гри, s м/пікс,
   інша палітра (інвертована яскравість), шкала 208 пікс внизу ліворуч */
function fakeShot(cx, cy, s, invert = true) {
  const W = 1920, H = 1080, fx = cx - mm.FRAME.x0 - W / 2 * s, fy = mm.FRAME.yt - cy - H / 2 * s;
  const g = mm.renderRef(ref, s, { x: fx, y: fy, w: W * s, h: H * s }, 2);
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = g.d[Math.min(g.h - 1, y) * g.w + Math.min(g.w - 1, x)]; if (invert) v = 1 - v;
    const i = (y * W + x) * 4, c = Math.round(v * 255);
    data[i] = c; data[i + 1] = Math.round(c * 0.8); data[i + 2] = Math.round(c * 0.6); data[i + 3] = 255;   // BGRA, «тепла» палітра
  }
  for (let x = 30; x < 238; x++) for (let y = 943; y < 945; y++) data.fill(170, (y * W + x) * 4, (y * W + x) * 4 + 3);   // сіра шкала
  return { width: W, height: H, data };
}

test('шкала: довжина й число', () => {
  const bar = mm.scaleBar(fakeShot(-430, 1120, 2.65));
  assert.ok(Math.abs(bar.px - 208) <= 2, 'довжина шкали ' + bar.px);
  assert.equal(mm.scaleMeters('551m'), 551);
  assert.equal(mm.scaleMeters('2750m'), 2750);
  assert.equal(mm.scaleMeters('4 129m'), 129);
  assert.equal(mm.scaleMeters('95m'), 95);
  assert.equal(mm.scaleMeters('1,2km'), 1200);
  assert.equal(mm.scaleMeters('—'), null);
});

/* палітра з сірими дорогами: довга товста дорога біля шкали не шкала (2026-10-30 бралась дорога на y≈909 і ≈984) */
test('шкала поверх і поруч сірих доріг — та сама 210 пікс', () => {
  for (const f of ['mirror-park-spawn-390.png', 'vinewood-hills-bar-108.png']) {
    const bar = mm.scaleBar(decodePng(fs.readFileSync(path.join(__dirname, 'fixtures', 'map', f))), false);
    assert.ok(bar && Math.abs(bar.px - 210) <= 2 && Math.abs(bar.y - 943) <= 1, `${f}: ${JSON.stringify(bar && { px: bar.px, y: bar.y })}`);
  }
});

test('шкала в імперських одиницях гри: фути й милі → метри', () => {
  assert.equal(mm.scaleMeters('820ft'), 249.94);
  assert.equal(mm.scaleMeters('1,000ft'), 304.8);
  assert.equal(mm.scaleMeters('0.5mi'), 804.67);
  assert.equal(mm.scaleMeters('1mi'), 1609.34);
  assert.equal(mm.scaleMeters('551m'), 551);   // «m» не плутається з «mi»
});

test('без шкали — велика карта не відкрита', () => {
  assert.equal(mm.locate({ width: 1920, height: 1080, data: Buffer.alloc(1920 * 1080 * 4) }, ref, 500, { cache }).kind, 'no_map');
});

test('масштаб поза 50–1500 м — підказка, а не точка', () => {
  const f = fakeShot(-430, 1120, 2.65);
  assert.equal(mm.locate(f, ref, 2750, { cache }).kind, 'zoom_in');
  assert.equal(mm.locate(f, ref, 28, { cache }).kind, 'zoom_out');
  assert.equal(mm.locate(f, ref, 1800, { cache }).kind, 'zoom_in');
});

for (const [name, cx, cy, s] of [
  ['Вайнвуд, ~550 м', -430, 1120, 2.65],
  ['центр Лос-Сантоса, ~300 м', 150, -900, 1.5],
  ['Сенді-Шорс, ~900 м', 1900, 3700, 4.3],
]) {
  test('інша палітра — та сама точка: ' + name, () => {
    const shot = fakeShot(cx, cy, s);
    mm.locate(shot, ref, Math.round(s * 208), { cache });   // перший виклик будує еталон цього масштабу — у програмі це робиться заздалегідь
    const t0 = Date.now();
    const r = mm.locate(shot, ref, Math.round(s * 208), { cache });
    const ms = Date.now() - t0;
    assert.equal(r.kind, 'point', JSON.stringify(r));
    const err = Math.hypot(r.x - cx, r.y - cy);
    console.log(`  ${name}: похибка ${err.toFixed(1)} м, бал ${r.match.score}, відрив ${r.match.ratio}, ${ms} мс`);
    assert.ok(err <= 30, `похибка ${err.toFixed(1)} м`);
  });
}

/* хибна точка гірша за відсутню (принцип IV): на зображенні без мапи — лише «не впевнений» */
test('шум зі шкалою — не точка', () => {
  const W = 1920, H = 1080, data = Buffer.alloc(W * H * 4);
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {   // плями 8×8, як рельєф на чужій палітрі
    const v = Math.round(20 + rnd() * 60);
    for (let yy = y; yy < y + 8; yy++) for (let xx = x; xx < x + 8; xx++) data.fill(v, (yy * W + xx) * 4, (yy * W + xx) * 4 + 3);
  }
  for (let x = 30; x < 238; x++) for (let y = 943; y < 945; y++) data.fill(170, (y * W + x) * 4, (y * W + x) * 4 + 3);
  const r = mm.locate({ width: W, height: H, data }, ref, 300, { cache });
  assert.notEqual(r.kind, 'point', JSON.stringify(r));
});

/* справжні кадри великої карти з fixtures/map: <назва>.png + <назва>.json { x, y, scale_m }.
   Головне — жодної хибної точки: краще «не впевнений», ніж мітка не там (конституція, принцип IV).
   specs/083 (етап 3 біля хрестика): 100–600 м — ≥ 90 % у межах 10 м і жодної далі 20 м; 600–1000 м — ≥ 90 % у межах 20 м;
   усі — жодної далі 50 м (хибна); знайдено на 100–1000 м — не менше, ніж до 083 (28/29); час — у звіті.
   2026-11-14: 35/39 знайдено, 100–600 м — макс. 9,9 м, 600–1000 м — макс. 12,9 м (до 083: 34/39, викиди до 24 м) */
const FIX = path.join(__dirname, 'fixtures', 'map');
const MIN_FOUND = 0.85, MIN_WORK = 0.9;
const BANDS = [['50–100 м', 0, 100], ['100–600 м', 100, 600], ['600–1000 м', 600, 1000], ['1000+ м', 1000, 1e9]];
/* звіт по смугах масштабу: скільки кадрів, знайдено, медіана, 90-й перцентиль і максимум похибки */
function bands(rows) {
  for (const [name, lo, hi] of BANDS) {
    const b = rows.filter(r => r.m >= lo && r.m < hi), e = b.filter(r => r.err != null).map(r => r.err).sort((a, c) => a - c);
    const q = p => (e.length ? e[Math.min(e.length - 1, Math.floor(p * e.length))].toFixed(1) : '—');
    console.log(`  ${name}: кадрів ${b.length}, знайдено ${e.length}, медіана ${q(0.5)} м, 90% ${q(0.9)} м, макс ${e.length ? e[e.length - 1].toFixed(1) : '—'} м`);
  }
}
test('справжні кадри: 100–600 м ≤ 10 м (90 %) і ≤ 20 м усі, 600–1000 м ≤ 20 м (90 %), хибних 0', () => {
  const files = fs.readdirSync(FIX).filter(f => f.endsWith('.png'));
  const rows = []; let ms = 0;
  for (const f of files) {
    const meta = JSON.parse(fs.readFileSync(path.join(FIX, f.replace(/\.png$/, '.json')), 'utf8'));
    const t0 = Date.now();
    const r = mm.locate(decodePng(fs.readFileSync(path.join(FIX, f))), ref, meta.scale_m, { bgra: false, cache });
    ms += Date.now() - t0;
    if (r.kind !== 'point') { console.log(`  ${f}: ${r.kind}, бал ${r.match?.score}, відрив ${r.match?.ratio}`); rows.push({ f, m: meta.scale_m, err: null }); continue; }
    const err = Math.hypot(r.x - meta.x, r.y - meta.y);
    console.log(`  ${f}: похибка ${err.toFixed(1)} м, бал ${r.match.score}, відрив ${r.match.ratio}${r.match.fine3 ? `, етап 3: крок ${r.match.fine3.r} м` : ''}`);
    rows.push({ f, m: meta.scale_m, err });
  }
  bands(rows);
  console.log(`  середній час locate: ${Math.round(ms / files.length)} мс`);
  const found = rows.filter(r => r.err != null);
  for (const r of found) assert.ok(r.err <= 50, `${r.f}: хибна точка, ${r.err.toFixed(1)} м`);
  const mid = found.filter(r => r.m >= 100 && r.m < 600), far = found.filter(r => r.m >= 600 && r.m <= 1000);
  for (const r of mid) assert.ok(r.err <= 20, `${r.f}: ${r.err.toFixed(1)} м на 100–600 м`);
  assert.ok(mid.filter(r => r.err <= 10).length >= 0.9 * mid.length, '100–600 м: менше 90 % у межах 10 м');
  assert.ok(far.filter(r => r.err <= 20).length >= 0.9 * far.length, '600–1000 м: менше 90 % у межах 20 м');
  const work = rows.filter(r => r.m >= 100 && r.m <= 1000);
  assert.ok(work.filter(r => r.err != null).length >= MIN_WORK * work.length, `100–1000 м: знайдено ${work.filter(r => r.err != null).length} з ${work.length}`);
  assert.ok(found.length >= MIN_FOUND * files.length, `знайдено ${found.length} з ${files.length}`);
});
