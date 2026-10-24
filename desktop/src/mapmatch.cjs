/* Де гравець на великій карті гри (F9). Чиста логіка без Electron — перевіряється mapmatch.test.cjs.
   Знімок порівнюється з еталоном мапи Q-Hub (public/map/game/export.bin — ті самі трикутники, з яких Q-Hub робить
   текстури для гри) за КРАЯМИ, а не кольорами: у гравців буває інша палітра карти, а дороги й береги ті самі.
   Масштаб відомий зі шкали внизу ліворуч, карта завжди на північ — тож шукаємо лише зсув: грубо по всій мапі через FFT,
   потім точніше біля найкращих місць. Не впевнені — координат не даємо (конституція, принцип IV). */

/* кадр еталона: лівий верхній кут у метрах гри, вершини трикутників — у чвертях метра від нього (як GAME у src/lib/gameMap.ts) */
const FRAME = { x0: -4140, yt: 8400, w: 9000, h: 13500 };
const SEA = 0.05;                       // яскравість моря (трикутників моря в export.bin немає)
const COARSE = [16, 24, 32, 48], FINE = 8;   // м/пікс: грубий пошук по всій мапі (за масштабом знімка) й уточнення
const PAD = 2500;                       // море навколо мапи: на великому масштабі частина знімка — за краєм еталона
const MIN_SCORE = 0.3, MIN_RATIO = 1.2; // пороги впевненості (R5) — підбираються на знімках
const AGREE = 3;                        // пікс (×8 м): наскільки можуть розійтися половини шаблону при правильному збігу
const MIN_EDGES = 0.35;                // місця з країв менше за третину медіани (море, поле) не розглядаються
const SCALE_MIN = 50, SCALE_MAX = 1500;   // на 114 м і 551 м перевірено на справжніх кадрах; хибне відсіює поріг впевненості

const lum = hex => { const v = parseInt(hex.slice(1), 16); return (0.299 * (v >> 16 & 255) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255)) / 255; };

/* export.bin: n (uint32), n*6 uint16 вершин, n uint8 кольорів; meta — export.json (palette, q) */
function parseRef(buf, meta) {
  const n = buf.readUInt32LE(0);
  const xy = new Uint16Array(n * 6), col = new Uint8Array(n);
  for (let i = 0; i < n * 6; i++) xy[i] = buf.readUInt16LE(4 + i * 2);
  buf.copy(Buffer.from(col.buffer), 0, 4 + n * 12, 4 + n * 13);
  return { n, xy, col, q: meta.q || 4, lum: meta.palette.map(lum) };
}

/* сірий растр еталона: box — ділянка кадру в метрах {x, y, w, h}, r — м/пікс. Дрібні трикутники не губляться:
   малюємо вчетверо детальніше й усереднюємо */
function renderRef(ref, r, box, ss = 4) {
  const rr = r / ss, W = Math.ceil(box.w / rr), H = Math.ceil(box.h / rr);
  const img = new Float32Array(W * H).fill(SEA);
  const k = 1 / (ref.q * rr), ox = box.x / rr, oy = box.y / rr;
  for (let t = 0; t < ref.n; t++) {
    const o = t * 6;
    const ax = ref.xy[o] * k - ox, ay = ref.xy[o + 1] * k - oy, bx = ref.xy[o + 2] * k - ox, by = ref.xy[o + 3] * k - oy, cx = ref.xy[o + 4] * k - ox, cy = ref.xy[o + 5] * k - oy;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    if (x0 > x1 || y0 > y1) continue;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (!area) continue;
    const s = area > 0 ? 1 : -1, v = ref.lum[ref.col[t]];
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        if (s * ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) < 0) continue;
        if (s * ((cx - bx) * (py - by) - (cy - by) * (px - bx)) < 0) continue;
        if (s * ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) < 0) continue;
        img[y * W + x] = v;
      }
    }
  }
  return ss === 1 ? { w: W, h: H, d: img } : shrink({ w: W, h: H, d: img }, ss);
}

/* зменшити в f разів (f може бути дробовим) — середнє по площі; маска (1 — рахувати) зменшується так само */
function shrink(g, f, mask) {
  const W = Math.floor(g.w / f), H = Math.floor(g.h / f), d = new Float32Array(W * H), m = mask ? new Float32Array(W * H) : null;
  for (let y = 0; y < H; y++) {
    const sy0 = Math.floor(y * f), sy1 = Math.min(g.h, Math.max(sy0 + 1, Math.floor((y + 1) * f)));
    for (let x = 0; x < W; x++) {
      const sx0 = Math.floor(x * f), sx1 = Math.min(g.w, Math.max(sx0 + 1, Math.floor((x + 1) * f)));
      let s = 0, n = 0, ms = 0;
      for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) {
        const i = yy * g.w + xx;
        if (mask) { if (!mask[i]) continue; ms++; }
        s += g.d[i]; n++;
      }
      d[y * W + x] = n ? s / n : 0;
      if (m) m[y * W + x] = ms / ((sy1 - sy0) * (sx1 - sx0)) > 0.9 ? 1 : 0;
    }
  }
  return { w: W, h: H, d, m };
}

/* модуль градієнта (Собель); на краю маски — нуль, щоб межа закритої ділянки не стала «дорогою» */
function edges(g, mask) {
  const { w, h, d } = g, e = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (mask && !(mask[i - w - 1] && mask[i - w + 1] && mask[i + w - 1] && mask[i + w + 1])) continue;
    const gx = d[i - w + 1] + 2 * d[i + 1] + d[i + w + 1] - d[i - w - 1] - 2 * d[i - 1] - d[i + w - 1];
    const gy = d[i + w - 1] + 2 * d[i + w] + d[i + w + 1] - d[i - w - 1] - 2 * d[i - w] - d[i - w + 1];
    e[i] = Math.sqrt(gx * gx + gy * gy);
  }
  return { w, h, d: e };
}

/* ---------- FFT (радикс-2, на місці) і взаємна кореляція ---------- */
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const p = i + j, q = p + len / 2;
        const xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function fft2(re, im, W, H, inv) {
  const rr = new Float64Array(W), ri = new Float64Array(W);
  for (let y = 0; y < H; y++) { const o = y * W; for (let x = 0; x < W; x++) { rr[x] = re[o + x]; ri[x] = im[o + x]; } fft(rr, ri, inv); for (let x = 0; x < W; x++) { re[o + x] = rr[x]; im[o + x] = ri[x]; } }
  const cr = new Float64Array(H), ci = new Float64Array(H);
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) { cr[y] = re[y * W + x]; ci[y] = im[y * W + x]; } fft(cr, ci, inv); for (let y = 0; y < H; y++) { re[y * W + x] = cr[y]; im[y * W + x] = ci[y]; } }
}
const pow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };
function spectrum(src, sw, sh, W, H) {
  const re = new Float64Array(W * H), im = new Float64Array(W * H);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) re[y * W + x] = src[y * sw + x];
  fft2(re, im, W, H, false);
  return { re, im };
}
/* c[u,v] = Σ a[u+x, v+y] · t[x, y] — для всіх зсувів одразу */
function xcorr(A, T, W, H) {
  const re = new Float64Array(W * H), im = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) { re[i] = A.re[i] * T.re[i] + A.im[i] * T.im[i]; im[i] = A.im[i] * T.re[i] - A.re[i] * T.im[i]; }
  fft2(re, im, W, H, true);
  return re;
}

/* спектри зображення для ncc — для еталона рахуються раз і кешуються */
function prep(a) {
  const W = pow2(a.w), H = pow2(a.h);
  const a2 = new Float32Array(a.d.length); for (let i = 0; i < a2.length; i++) a2[i] = a.d[i] * a.d[i];
  const f32 = s => ({ re: Float32Array.from(s.re), im: Float32Array.from(s.im) });   // кеш еталона — вдвічі менше пам'яті
  return { w: a.w, h: a.h, W, H, A: f32(spectrum(a.d, a.w, a.h, W, H)), A2: f32(spectrum(a2, a.w, a.h, W, H)) };
}
/* нормована кореляція шаблону t (з маскою m) по зображенню a: для кожного зсуву, де шаблон цілком на зображенні.
   minVar — частка медіанної «кількості країв» еталона під шаблоном: де їх менше (море, поле), бал не рахується —
   на майже порожньому еталоні нормування роздуває випадковий шум до високого балу (хибна точка на узбережжі, 2026-10-24) */
function ncc(a, t, m, minVar = 0) {
  if (!a.A) a = prep(a);
  const { W, H, A, A2 } = a;
  let n = 0, s = 0; for (let i = 0; i < t.d.length; i++) if (m[i]) { n++; s += t.d[i]; }
  if (!n || t.w > a.w || t.h > a.h) return { w: 0, h: 0, d: new Float32Array(0) };
  const mean = s / n, tz = new Float64Array(t.d.length); let tn = 0;
  for (let i = 0; i < t.d.length; i++) if (m[i]) { tz[i] = t.d[i] - mean; tn += tz[i] * tz[i]; }
  tn = Math.sqrt(tn) || 1;
  const T = spectrum(tz, t.w, t.h, W, H), M = spectrum(m, t.w, t.h, W, H);
  const num = xcorr(A, T, W, H), sa = xcorr(A, M, W, H), sa2 = xcorr(A2, M, W, H);
  const ow = a.w - t.w + 1, oh = a.h - t.h + 1, out = new Float32Array(Math.max(0, ow * oh)), vars = new Float32Array(out.length);
  for (let v = 0; v < oh; v++) for (let u = 0; u < ow; u++) { const i = v * W + u; vars[v * ow + u] = sa2[i] - sa[i] * sa[i] / n; }
  let floor = 1e-9;
  if (minVar > 0) {
    const pos = vars.filter(x => x > 1e-9).sort();
    if (pos.length) floor = Math.max(floor, minVar * pos[pos.length >> 1]);
  }
  for (let v = 0; v < oh; v++) for (let u = 0; u < ow; u++) {
    const k = v * ow + u, va = vars[k];
    out[k] = va > floor ? num[v * W + u] / (tn * Math.sqrt(va)) : 0;
  }
  return { w: ow, h: oh, d: out };
}
/* найкращі піки, віддалені один від одного щонайменше на r пікселів */
function peaks(c, k, r) {
  const idx = [...c.d.keys()].sort((i, j) => c.d[j] - c.d[i]), out = [];
  for (const i of idx) {
    const x = i % c.w, y = (i / c.w) | 0;
    if (out.every(p => (p.x - x) ** 2 + (p.y - y) ** 2 > r * r)) out.push({ x, y, s: c.d[i] });
    if (out.length >= k) break;
  }
  return out;
}

/* вершина параболи через пік і двох сусідів — положення між пікселями (−0.5…0.5) */
function subpixel(c, x, y) {
  const at = (u, v) => c.d[v * c.w + u];
  const f = (m, z, p) => { const den = m - 2 * z + p; return den < 0 ? Math.max(-0.5, Math.min(0.5, (m - p) / (2 * den))) : 0; };
  return [x > 0 && x < c.w - 1 ? f(at(x - 1, y), at(x, y), at(x + 1, y)) : 0, y > 0 && y < c.h - 1 ? f(at(x, y - 1), at(x, y), at(x, y + 1)) : 0];
}
/* вирізати прямокутник із сірого знімка й маски */
function sub(g, m, x0, y0, w, h) {
  const d = new Float32Array(w * h), mm = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * g.w + x0 + x; d[y * w + x] = g.d[i]; mm[y * w + x] = m[i]; }
  return { g: { w, h, d }, m: mm };
}

/* ---------- знімок екрана ---------- */
/* ділянки інтерфейсу, які не є картою (виміряно на 1920×1080): легенда справа, підказки внизу, шкала й район ліворуч */
function mask(w, h) {
  const k = h / 1080, m = new Uint8Array(w * h).fill(1);
  const off = (x0, y0, x1, y1) => { for (let y = Math.max(0, Math.round(y0 * k)); y < Math.min(h, Math.round(y1 * k)); y++) m.fill(0, y * w + Math.max(0, Math.round(x0 * k)), y * w + Math.min(w, Math.round(x1 * k))); };
  off(w / k - 400, 0, w / k, 840);            // легенда фракцій
  off(0, 1015, w / k, 1080);                  // рядок підказок
  off(0, 900, 300, 1080);                     // шкала й назва району
  off(0, 0, 60, 20);                          // лічильник кадрів у кутку
  const cx = w / 2 / k, cy = h / 2 / k;          // лінії хрестика (на еталоні їх немає)
  off(cx - 200, cy - 4, cx + 200, cy + 5); off(cx - 4, cy - 200, cx + 5, cy + 200);
  return m;
}
/* яскравість знімка: rgba (Buffer, BGRA з Electron або RGBA) → Float32 0..1 */
function gray(img, bgra = true) {
  const { width: w, height: h, data } = img, d = new Float32Array(w * h), [r, b] = bgra ? [2, 0] : [0, 2];
  for (let i = 0; i < w * h; i++) d[i] = (0.299 * data[i * 4 + r] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + b]) / 255;
  return { w, h, d };
}

/* шкала масштабу внизу ліворуч: найдовша світло-сіра горизонтальна лінія (у грі вона 1–2 пікс завтовшки, яскравість ~150–190).
   Повертає її довжину в пікселях і ділянку з числом під нею */
function scaleBar(img, bgra = true) {
  const { width: w, height: h, data } = img, k = h / 1080, [r, b] = bgra ? [2, 0] : [0, 2];
  let best = null;
  for (let y = Math.round(880 * k); y < Math.round(990 * k); y++) {
    let run = 0, start = 0;
    for (let x = 0; x < Math.round(320 * k); x++) {
      const i = (y * w + x) * 4, R = data[i + r], G = data[i + 1], B = data[i + b];
      const white = R > 135 && Math.abs(R - G) < 14 && Math.abs(G - B) < 14;
      if (white) { if (!run) start = x; run++; } else run = 0;
      if (run > 80 * k && (!best || run > best.px)) best = { px: run, x0: start, x1: x, y };
    }
  }
  if (!best) return null;
  return { px: best.px, y: best.y, number: { x: Math.max(0, best.x1 - Math.round(120 * k)), y: best.y + Math.round(6 * k), width: Math.round(130 * k), height: Math.round(34 * k) } };
}
/* «551m», «1.2km» → метри. Береться лише число впритул до «m»: OCR іноді додає зайву цифру через пробіл («4 129m» → 129) */
function scaleMeters(text) {
  const t = String(text || '').replace(/,/g, '.').toLowerCase().trim();
  const m = /(\d+(?:\.\d+)?)(km|m)\b/.exec(t) || /(\d+(?:\.\d+)?)$/.exec(t); if (!m) return null;
  const v = parseFloat(m[1]) * (m[2] === 'km' ? 1000 : 1);
  return v > 0 ? v : null;
}

/* точка мітки — хрестик великої карти: він завжди в центрі екрана, карта рухається під ним.
   Так можна позначити й те, що бачиш здалеку, а не лише місце, де стоїш */
const target = (w, h) => ({ x: w / 2, y: h / 2 });

/* ---------- головне ---------- */
/* краї всієї мапи (з морем навколо) для грубого пошуку на кроці rc — рахуються раз */
const coarseRef = (ref, rc, cache) => (cache[rc] ??= prep(edges(renderRef(ref, rc, { x: -PAD, y: -PAD, w: FRAME.w + 2 * PAD, h: FRAME.h + 2 * PAD }))));
/* заздалегідь, щоб перше F9 не чекало: усі кроки грубого пошуку */
function warm(ref, cache) { for (const rc of COARSE) coarseRef(ref, rc, cache); }

/* frame — знімок {width, height, data}; ref — parseRef(); meters — число зі шкали (OCR); cache — для повторних викликів */
function locate(frame, ref, meters, opts = {}) {
  const bgra = opts.bgra !== false, cache = opts.cache || {};
  const bar = scaleBar(frame, bgra);
  if (!bar) return { kind: 'no_map' };
  if (!meters) return { kind: 'no_map' };
  if (meters > SCALE_MAX) return { kind: 'zoom_in', meters };
  if (meters < SCALE_MIN) return { kind: 'zoom_out', meters };
  const aim = target(frame.width, frame.height);
  const s = meters / bar.px;   // м на піксель екрана
  const g = gray(frame, bgra), ui = mask(frame.width, frame.height);

  /* грубо: уся мапа (з морем навколо); крок — найгрубший, при якому знімок ще щонайменше 150 пікс завширшки */
  const rc = [...COARSE].reverse().find(r => frame.width * s / r >= 150) || COARSE[0];
  const t = shrink(g, rc / s, ui), te = edges(t, t.m);
  const c = ncc(coarseRef(ref, rc, cache), te, t.m, MIN_EDGES);
  const cand = peaks(c, 5, 150 / rc);

  /* точніше: лише квадрат ~1,6 км навколо гравця (менше роботи, і похибка масштабу на краях екрана не заважає),
     8 м/пікс, у вікні ± два кроки грубого пошуку, з уточненням між пікселями */
  const half = Math.min(800 / s, frame.width / 2, frame.height / 2);
  const cx0 = Math.round(Math.min(Math.max(0, aim.x - half), frame.width - 2 * half)), cy0 = Math.round(Math.min(Math.max(0, aim.y - half), frame.height - 2 * half));
  const crop = sub(g, ui, cx0, cy0, Math.round(2 * half), Math.round(2 * half));
  const tf = shrink(crop.g, FINE / s, crop.m), tfe = edges(tf, tf.m), pad = 2 * rc;
  const fine = cand.map(p => {
    const box = { x: p.x * rc - PAD + cx0 * s - pad, y: p.y * rc - PAD + cy0 * s - pad, w: tf.w * FINE + 2 * pad, h: tf.h * FINE + 2 * pad };
    const re = prep(edges(renderRef(ref, FINE, box))), cc = ncc(re, tfe, tf.m), [best] = peaks(cc, 1, 1);
    if (!best) return null;
    /* узгодженість: ліва й права половини шаблону окремо мають стати в те саме місце; випадковий збіг — розходиться */
    const split = side => { const m = Uint8Array.from(tf.m, (v, i) => (v && ((i % tf.w) < tf.w / 2) === side ? 1 : 0)); return peaks(ncc(re, tfe, m), 1, 1)[0]; };
    const L = split(true), R = split(false);
    const agree = !!L && !!R && Math.hypot(L.x - best.x, L.y - best.y) <= AGREE && Math.hypot(R.x - best.x, R.y - best.y) <= AGREE;
    const [dx, dy] = subpixel(cc, best.x, best.y);
    /* лівий верхній кут УСЬОГО знімка в метрах кадру */
    /* місце вибирає грубий етап (уся мапа, одне нормування), точний лише уточнює: окремо його бал на чужих
       ділянках буває вищим за правильний (хибна точка на узбережжі, 2026-10-24) — тож рахуємо добуток */
    return { fx: box.x + (best.x + dx) * FINE - cx0 * s, fy: box.y + (best.y + dy) * FINE - cy0 * s, s: Math.sqrt(Math.max(0, p.s) * Math.max(0, best.s)), coarse: p.s, fine: best.s, agree };
  }).filter(Boolean).sort((a, b) => b.s - a.s);
  if (!fine.length) return { kind: 'unsure', match: { scale_m_per_px: s, score: 0, ratio: 0 } };
  const [b1] = fine, other = fine.find(f => Math.hypot(f.fx - b1.fx, f.fy - b1.fy) > 150);
  const ratio = other ? b1.s / Math.max(other.s, 1e-6) : 9;
  const match = { scale_m_per_px: Math.round(s * 1e4) / 1e4, score: Math.round(b1.s * 1e3) / 1e3, ratio: Math.round(ratio * 100) / 100, agree: b1.agree };
  if (b1.s < MIN_SCORE || ratio < MIN_RATIO || !b1.agree) return { kind: 'unsure', match };
  /* лівий верхній кут знімка в метрах кадру + зсув до хрестика */
  const x = FRAME.x0 + b1.fx + aim.x * s, y = FRAME.yt - (b1.fy + aim.y * s);
  return { kind: 'point', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, match };
}

module.exports = { FRAME, warm, parseRef, renderRef, shrink, edges, fft, ncc, peaks, mask, gray, scaleBar, scaleMeters, target, locate, MIN_SCORE, MIN_RATIO };
