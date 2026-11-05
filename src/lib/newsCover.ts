/* Обкладинка новини для Discord (адмінка → «Новини»): банер у стилі Q-Hub за шаблоном, без ШІ — текст без помилок,
   щоразу той самий вигляд. Над заголовком — що це за новина: ПРОГРАМА (з версією) / САЙТ / НОВИНИ.
   Кирилиця — Manrope (в Archivo її немає), «Q-HUB» — Archivo, як у логотипі сайту. */

export const COVER = { w: 1600, h: 900 };
export type CoverKind = 'app' | 'site' | 'news';
const KICKER: Record<CoverKind, string> = { app: 'ПРОГРАМА', site: 'САЙТ', news: 'НОВИНИ' };

/* джерело чернетки → вид обкладинки; версія — з заголовка («Програма Q-Hub 0.8.0 — …» → 0.8) */
export function coverKind(sourceRef: string): CoverKind {
  const s = sourceRef.split(':')[0];
  return s === 'changelog' ? 'app' : s === 'site' ? 'site' : 'news';
}
export function coverVersion(title: string): string {
  const m = /\b(\d+)\.(\d+)(?:\.\d+)?\b/.exec(title);
  return m ? `${m[1]}.${m[2]}` : '';
}
/* заголовок без префікса джерела — він уже є великим написом над ним */
export const coverTitle = (title: string) => title.replace(/^(Програма|Сайт) Q-Hub(\s+\d+(\.\d+)*)?\s*(:|—)\s*/u, '').trim() || title;

/* рядки не ширші за max; задовгий текст — до lines рядків з «…» */
export function wrap(measure: (s: string) => number, text: string, max: number, lines: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? cur + ' ' + w : w;
    if (cur && measure(next) > max) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  if (out.length <= lines) return out;
  const keep = out.slice(0, lines); let last = keep[lines - 1];
  while (last && measure(last + '…') > max) last = last.replace(/\s*\S+$/, '');
  keep[lines - 1] = (last || keep[lines - 1]) + '…';
  return keep;
}

const ACCENT = '#ff6b00', BG = '#0b0e12', FG = '#f4f1ec';
/* знак Q-Hub (той самий контур, що в /brand/q-hub-logo.svg) у квадраті 100×100 */
let mark: Path2D | null = null;
const MARK_D = ('M50 10A40 40 0 0 0 10 50A40 40 0 0 0 50 90H90V50A40 40 0 0 0 50 10ZM50 34A16 16 0 1 1 50 66A16 16 0 1 1 50 34Z');
const markPath = () => (mark ??= new Path2D(MARK_D));

export async function drawCover(opt: { kind: CoverKind; title: string; version?: string; date?: string }): Promise<HTMLCanvasElement> {
  const { w: W, h: H } = COVER;
  await Promise.all(['800 80px Manrope', '600 30px Manrope', '800 40px Archivo'].map(f => document.fonts.load(f).catch(() => null)));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;

  /* тло: темне з помаранчевим сяйвом праворуч і косими смугами */
  c.fillStyle = BG; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W * 0.86, H * 0.2, 0, W * 0.86, H * 0.2, W * 0.7);
  glow.addColorStop(0, 'rgba(255, 107, 0, .42)'); glow.addColorStop(0.45, 'rgba(255, 107, 0, .10)'); glow.addColorStop(1, 'rgba(255, 107, 0, 0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  c.save(); c.globalAlpha = 0.06; c.strokeStyle = FG; c.lineWidth = 2;
  for (let x = -H; x < W; x += 46) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + H, 0); c.stroke(); }
  c.restore();
  /* великий знак Q праворуч, напівпрозорий */
  c.save(); c.translate(W - 620, H / 2 - 330); c.scale(6.6, 6.6); c.rotate(-0.12);
  c.fillStyle = 'rgba(255, 107, 0, .16)'; c.fill(markPath(), 'evenodd');
  c.lineWidth = 0.5; c.strokeStyle = 'rgba(255, 140, 60, .55)'; c.stroke(markPath());
  c.restore();
  /* помаранчева смуга ліворуч */
  c.fillStyle = ACCENT; c.fillRect(0, 0, 14, H);

  const X = 110;
  /* логотип: квадрат з Q + «Q-HUB.fun» */
  c.save(); c.translate(X, 92);
  c.fillStyle = ACCENT; c.beginPath(); c.roundRect(0, 0, 84, 84, 20); c.fill();
  c.translate(42, 42); c.scale(0.66, 0.66); c.translate(-51, -51); c.fillStyle = '#160800'; c.fill(markPath(), 'evenodd');
  c.restore();
  c.textBaseline = 'middle'; c.textAlign = 'left';
  c.font = '800 46px Archivo, "Arial Black", sans-serif';
  c.fillStyle = FG; c.fillText('Q-HUB', X + 108, 136);
  const qw = c.measureText('Q-HUB').width;
  c.fillStyle = ACCENT; c.fillText('.fun', X + 108 + qw, 136);

  /* вид новини великим + версія плашкою */
  c.textBaseline = 'alphabetic';
  c.font = '800 150px Manrope, sans-serif';
  const kicker = KICKER[opt.kind];
  c.fillStyle = FG; c.fillText(kicker, X - 6, 430);
  const kw = c.measureText(kicker).width;
  c.fillStyle = ACCENT; c.fillRect(X, 462, Math.min(kw, 260), 12);
  if (opt.version) {
    c.font = '800 64px Manrope, sans-serif';
    const vt = 'v' + opt.version, vw = c.measureText(vt).width + 56;
    c.fillStyle = ACCENT; c.beginPath(); c.roundRect(X + kw + 28, 330, vw, 104, 52); c.fill();
    c.fillStyle = '#160800'; c.fillText(vt, X + kw + 56, 405);
  }

  /* заголовок — до двох рядків */
  c.font = '800 66px Manrope, sans-serif'; c.fillStyle = FG;
  const lines = wrap(s => c.measureText(s).width, coverTitle(opt.title), W - X - 160, 2);
  lines.forEach((l, i) => c.fillText(l, X, 590 + i * 82));

  /* низ: сайт і дата */
  c.font = '600 32px Manrope, sans-serif'; c.fillStyle = 'rgba(244, 241, 236, .62)';
  c.fillText(['q-hub.fun', 'Quant RP', opt.date].filter(Boolean).join('  ·  '), X, H - 76);
  return cv;
}

export const coverBlob = (cv: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('не вдалося зберегти картинку'))), 'image/webp', 0.9));
