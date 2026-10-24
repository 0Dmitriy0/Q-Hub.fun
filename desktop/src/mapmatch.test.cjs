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

/* справжні кадри F9 з fixtures/map: <назва>.png + <назва>.json { x, y, scale_m } */
const FIX = path.join(__dirname, 'fixtures', 'map');
for (const f of fs.readdirSync(FIX).filter(f => f.endsWith('.png'))) {
  const meta = JSON.parse(fs.readFileSync(path.join(FIX, f.replace(/\.png$/, '.json')), 'utf8'));
  if (meta.x === null) continue;
  test('справжній кадр: ' + f, () => {
    const r = mm.locate(decodePng(fs.readFileSync(path.join(FIX, f))), ref, meta.scale_m, { bgra: false, cache });
    assert.equal(r.kind, 'point', JSON.stringify(r));
    const err = Math.hypot(r.x - meta.x, r.y - meta.y);
    console.log(`  ${f}: похибка ${err.toFixed(1)} м, бал ${r.match.score}, відрив ${r.match.ratio}`);
    assert.ok(err <= 30, `похибка ${err.toFixed(1)} м`);
  });
}
