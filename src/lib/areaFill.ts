/* Заливка зони (поле полювання, поле скарбів) для вектора мінікарти гри. Колір вершини на радарі непрозорий, тож
   «напівпрозору» заливку, як на текстурах, збираємо з геометрії: під полем — тло кольору зони, а поверх — та сама мапа
   (дороги, будівлі з export.bin), обрізана по контуру поля й підфарбована кольором зони. Так поле зафарбоване, а дороги
   в ньому видно. Написи й значки лежать у старших номерах файлів — вони зверху. */
export type Pt = [number, number];
export type Tri = [Pt, Pt, Pt];

const area2 = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const ccw = (t: Tri): Tri => (area2(t[0], t[1], t[2]) < 0 ? [t[0], t[2], t[1]] : t);

function inTri(p: Pt, [a, b, c]: Tri): boolean {
  const d1 = area2(a, b, p), d2 = area2(b, c, p), d3 = area2(c, a, p);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/* контур → трикутники («відрізання вух»); увігнуті поля теж. Повтори точок і вироджені кути відкидаються */
export function earClip(ring: readonly Pt[]): Tri[] {
  const pts: Pt[] = [];
  for (const p of ring) { const l = pts[pts.length - 1]; if (!l || Math.abs(l[0] - p[0]) > 1e-9 || Math.abs(l[1] - p[1]) > 1e-9) pts.push([p[0], p[1]]); }
  if (pts.length > 1 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-9 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-9) pts.pop();
  if (pts.length < 3) return [];
  let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
  if (s < 0) pts.reverse();   // далі контур проти годинникової
  const out: Tri[] = [], idx = pts.map((_, i) => i);
  let guard = pts.length * pts.length + 10;
  while (idx.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = pts[idx[(i + idx.length - 1) % idx.length]], b = pts[idx[i]], c = pts[idx[(i + 1) % idx.length]];
      const ar = area2(a, b, c);
      if (ar < -1e-9) continue;   // увігнутий кут — не вухо
      if (ar > 1e-9 && idx.some(j => { const p = pts[j]; return p !== a && p !== b && p !== c && inTri(p, [a, b, c]); })) continue;
      if (ar > 1e-9) out.push([a, b, c]);
      idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;   // контур сам себе перетинає — решту віялом, краще за ніщо
  }
  for (let i = 1; i + 1 < idx.length; i++) { const t: Tri = [pts[idx[0]], pts[idx[i]], pts[idx[i + 1]]]; if (Math.abs(area2(...t)) > 1e-9) out.push(ccw(t)); }
  return out;
}

/* опуклий багатокутник poly, обрізаний трикутником clip (Сазерленд — Ходжмен); порожньо — не перетинаються */
export function clipConvex(poly: readonly Pt[], clip: Tri): Pt[] {
  let out = poly.slice() as Pt[];
  const c = ccw(clip);
  for (let e = 0; e < 3 && out.length; e++) {
    const a = c[e], b = c[(e + 1) % 3], src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const p = src[i], q = src[(i + 1) % src.length], dp = area2(a, b, p), dq = area2(a, b, q);
      if (dp >= 0) out.push(p);
      if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out.length >= 3 ? out : [];
}

const box = (ps: readonly Pt[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of ps) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1] as const; };

/* частини трикутника мапи, що лежать усередині поля (поле — вже трикутниками earClip, з їхніми габаритами) */
export type FieldTris = { tri: Tri; b: readonly [number, number, number, number] }[];
export const fieldTris = (ring: readonly Pt[]): FieldTris => earClip(ring).map(tri => ({ tri, b: box(tri) }));
export function clipToField(t: Tri, field: FieldTris, minArea = 0.05): Tri[] {
  const tb = box(t), out: Tri[] = [];
  for (const f of field) {
    if (tb[2] < f.b[0] || tb[0] > f.b[2] || tb[3] < f.b[1] || tb[1] > f.b[3]) continue;
    const p = clipConvex(t, f.tri);
    for (let i = 1; i + 1 < p.length; i++) if (Math.abs(area2(p[0], p[i], p[i + 1])) / 2 >= minArea) out.push([p[0], p[i], p[i + 1]]);
  }
  return out;
}

/* колір мапи під напівпрозорою заливкою зони (та сама частка .28, що на текстурах — gameMap.drawMap) */
export const AREA_TINT = 0.28;
export const tint = (c: readonly number[], a: readonly number[], k = AREA_TINT): [number, number, number] =>
  [0, 1, 2].map(i => Math.round(c[i] * (1 - k) + a[i] * k)) as [number, number, number];
