import { describe, expect, it } from 'vitest';
import { clipConvex, clipToField, earClip, fieldTris, tint, type Pt, type Tri } from './areaFill';
import { inRing } from './huntAnimals';

const sql = Object.values(import.meta.glob('/supabase/seed/map_hunting_fields.sql', { query: '?raw', import: 'default', eager: true }))[0] as string;
const fields = [...sql.matchAll(/\('(Поле полювання \d+)', '(\[\[.*?\]\])'\)/g)].map(m => ({ name: m[1], ring: JSON.parse(m[2]) as Pt[] }));
const triArea = ([a, b, c]: Tri) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
const ringArea = (r: Pt[]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

describe('заливка зони для мінікарти гри', () => {
  it('увігнутий контур: трикутники покривають рівно його площу', () => {
    const u: Pt[] = [[0, 0], [300, 0], [300, 300], [200, 300], [200, 100], [100, 100], [100, 300], [0, 300]];
    const ts = earClip(u);
    expect(ts.reduce((s, t) => s + triArea(t), 0)).toBeCloseTo(ringArea(u), 6);
    for (const t of ts) expect(inRing([(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3], u)).toBe(true);
  });
  it('справжні поля полювання: площа сходиться, напрям обходу не важить', () => {
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      const a = ringArea(f.ring);
      expect(earClip(f.ring).reduce((s, t) => s + triArea(t), 0) / a).toBeCloseTo(1, 4);
      expect(earClip([...f.ring].reverse()).reduce((s, t) => s + triArea(t), 0) / a).toBeCloseTo(1, 4);
    }
  });
  it('обрізання трикутником: половина квадрата', () => {
    const sq: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const p = clipConvex(sq, [[0, 0], [10, 0], [0, 10]]);
    expect(ringArea(p)).toBeCloseTo(50, 6);
    expect(clipConvex(sq, [[50, 50], [60, 50], [50, 60]])).toEqual([]);
  });
  it('трикутник мапи, більший за поле, лишається лише всередині поля', () => {
    const u: Pt[] = [[0, 0], [300, 0], [300, 300], [200, 300], [200, 100], [100, 100], [100, 300], [0, 300]];
    const parts = clipToField([[-1000, -1000], [2000, -1000], [-1000, 2000]], fieldTris(u));
    expect(parts.reduce((s, t) => s + triArea(t), 0)).toBeCloseTo(ringArea(u), 4);
    expect(clipToField([[900, 900], [950, 900], [900, 950]], fieldTris(u))).toEqual([]);
  });
  it('підфарбування — частка кольору зони, як на текстурі', () => {
    expect(tint([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25]);
    expect(tint([36, 38, 42], [255, 0, 0])).toEqual([97, 27, 30]);
  });
});
