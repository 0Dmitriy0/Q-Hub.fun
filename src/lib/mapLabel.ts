/* Напис на мапі від адміна (specs/089): геометрія в метрах гри й рендер на canvas. Один рендер іде всюди —
   мапа сайту й програми (imageOverlay), текстури мапи для гри (пауза) і радар-мінікарта (смужки пікселів, як значки). */
import { fontCss } from './labelFonts';

export interface MapLabel {
  id: string; dbId?: number; text: string; x: number; y: number;
  color: string; font: string; weight: number; outlineColor: string; outlineW: number; angle: number; size: number;
}
export type Pt = [number, number];
export type LabelBox = { corners: Pt[]; x0: number; y0: number; x1: number; y1: number; w: number; h: number };
export type LabelRun = { x0: number; x1: number; y0: number; y1: number; c: [number, number, number] };

/* межі не з даних, а з розміру: кегль size (м), обводка з обох боків і запас під виносні елементи */
export const labelHeight = (l: Pick<MapLabel, 'size' | 'outlineW'>) => l.size * 1.3 + 2 * l.outlineW;

/* повернутий прямокутник напису шириною widthM (текст разом з обводкою) навколо (x, y); кут — проти годинникової, y гри вгору.
   corners: лівий верхній, правий верхній, правий нижній, лівий нижній (до повороту); x0/y0 — лівий верхній кут осьового бокса */
export function labelBox(l: Pick<MapLabel, 'x' | 'y' | 'angle' | 'size' | 'outlineW'>, widthM: number): LabelBox {
  const w = widthM, h = labelHeight(l), a = (l.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const corners = ([[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]] as Pt[])
    .map(([dx, dy]) => [l.x + dx * c - dy * s, l.y + dx * s + dy * c] as Pt);
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
  return { corners, x0: Math.min(...xs), y0: Math.max(...ys), x1: Math.max(...xs), y1: Math.min(...ys), w, h };
}

/* найбільший бік canvas — щоб великий напис на 4 px/м не зробив canvas, якого браузер не створить */
export const MAX_CANVAS = 4096;

/* ширина напису в метрах гри: текст шрифтом напису, обводка з обох боків і невеликий запас (той самий розрахунок — у рендері й ручках) */
let probe: CanvasRenderingContext2D | null = null;
export function labelWidth(l: MapLabel): number {
  probe ??= document.createElement('canvas').getContext('2d')!;
  probe.font = fontCss(l.font, l.weight, 100);
  return (probe.measureText(l.text).width / 100) * l.size + 2 * l.outlineW + l.size * 0.2;
}

/* напис на прозорому canvas осьового бокса; pxPerM може зменшитись під MAX_CANVAS — повертається той, що вжито */
export function renderLabel(l: MapLabel, pxPerM: number): { canvas: HTMLCanvasElement; box: LabelBox; pxPerM: number } {
  const box = labelBox(l, labelWidth(l));
  const k = Math.min(pxPerM, MAX_CANVAS / Math.max(box.x1 - box.x0, box.y0 - box.y1, 1));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil((box.x1 - box.x0) * k)); cv.height = Math.max(1, Math.ceil((box.y0 - box.y1) * k));
  const ctx = cv.getContext('2d')!;
  ctx.translate((l.x - box.x0) * k, (box.y0 - l.y) * k);
  ctx.rotate((-l.angle * Math.PI) / 180);   // у canvas y вниз — кут проти годинникової стає від'ємним
  ctx.font = fontCss(l.font, l.weight, l.size * k);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (l.outlineW > 0) { ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = 2 * l.outlineW * k; ctx.strokeStyle = l.outlineColor; ctx.strokeText(l.text, 0, 0); }
  ctx.fillStyle = l.color; ctx.fillText(l.text, 0, 0);
  return { canvas: cv, box, pxPerM: k };
}

/* пікселі canvas (RGBA w×h) → горизонтальні смужки одного кольору в метрах гри; колір квантований кроком 24, як у значків
   (gameMap.iconRuns), напівпрозоре (alpha < 128) відкидається */
export function labelRuns(px: Uint8ClampedArray, w: number, h: number, box: Pick<LabelBox, 'x0' | 'y0'>, pxPerM: number): LabelRun[] {
  const q = (v: number) => Math.min(255, Math.round(v / 24) * 24), out: LabelRun[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const i = (y * w + x) * 4; if (px[i + 3] < 128) { x++; continue; }
      const c: [number, number, number] = [q(px[i]), q(px[i + 1]), q(px[i + 2])]; let x2 = x + 1;
      while (x2 < w) { const j = (y * w + x2) * 4; if (px[j + 3] < 128 || q(px[j]) !== c[0] || q(px[j + 1]) !== c[1] || q(px[j + 2]) !== c[2]) break; x2++; }
      out.push({ x0: box.x0 + x / pxPerM, x1: box.x0 + x2 / pxPerM, y0: box.y0 - y / pxPerM, y1: box.y0 - (y + 1) / pxPerM, c });
      x = x2;
    }
  }
  return out;
}

/* однакові смужки (ті самі x0, x1, колір) у сусідніх рядках → одна вища смужка: на радарі в рази менше вершин.
   Смужки мають іти рядок за рядком згори вниз, як їх дає labelRuns */
export function mergeRuns(runs: LabelRun[]): LabelRun[] {
  const out: LabelRun[] = []; let prev = new Map<string, LabelRun>(), cur = new Map<string, LabelRun>(), rowY = NaN;
  for (const r0 of runs) {
    if (r0.y0 !== rowY) { prev = cur; cur = new Map(); rowY = r0.y0; }
    const key = `${r0.x0}|${r0.x1}|${r0.c.join(',')}`, p = prev.get(key);
    if (p && Math.abs(p.y1 - r0.y0) < 1e-9) { p.y1 = r0.y1; cur.set(key, p); }
    else { const r = { ...r0 }; out.push(r); cur.set(key, r); }
  }
  return out;
}

/* частина мапи гри для точки — та сама формула, що gameMap.supertileOf (тут своя копія, щоб мапа сайту не тягнула gameMap; тест звіряє) */
export const supertileAt = (x: number, y: number): [number, number] => [Math.floor((x + 4500) / 1175), Math.floor((8000 - y) / 1388)];

/* смужки → частини мапи гри (supertile «c_r») за центром смужки */
export function splitBySupertile(runs: LabelRun[]): Map<string, LabelRun[]> {
  const m = new Map<string, LabelRun[]>();
  for (const r of runs) {
    const [c, w] = supertileAt((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), k = c + '_' + w;
    let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(r);
  }
  return m;
}

/* рядок бази → напис (snake_case → camelCase) */
export function labelFromRow(r: Record<string, unknown>): MapLabel {
  return {
    id: 'label-' + r.id, dbId: r.id as number, text: String(r.text ?? ''), x: Number(r.x), y: Number(r.y),
    color: String(r.color ?? '#f4f1ec'), font: String(r.font ?? 'roboto-condensed'), weight: Number(r.weight ?? 700),
    outlineColor: String(r.outline_color ?? '#0d0d0d'), outlineW: Number(r.outline_w ?? 3), angle: Number(r.angle ?? 0), size: Number(r.size ?? 30),
  };
}
/* напис → рядок бази (без id) */
export const labelToRow = (l: MapLabel) => ({
  text: l.text.trim(), x: Math.round(l.x * 10) / 10, y: Math.round(l.y * 10) / 10, color: l.color.toLowerCase(), font: l.font, weight: l.weight,
  outline_color: l.outlineColor.toLowerCase(), outline_w: l.outlineW, angle: Math.round(l.angle * 10) / 10, size: Math.round(l.size * 10) / 10,
});
