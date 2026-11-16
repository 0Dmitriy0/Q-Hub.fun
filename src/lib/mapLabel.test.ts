import { describe, expect, it } from 'vitest';
import { supertileOf } from './gameMap';
import { mergeRuns, supertileAt, labelBox, labelFromRow, labelHeight, labelRuns, labelToRow, splitBySupertile } from './mapLabel';
import { fontWeight, LABEL_FONTS } from './labelFonts';

const L0 = { x: 100, y: 200, angle: 0, size: 30, outlineW: 3 };
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('напис мапи: межі', () => {
  it('без повороту — прямокутник навколо центру, y гри вгору', () => {
    const b = labelBox(L0, 100), h = labelHeight(L0);
    expect(h).toBeCloseTo(30 * 1.3 + 6);
    near(b.x0, 50); near(b.x1, 150); near(b.y0, 200 + h / 2); near(b.y1, 200 - h / 2);
  });
  it('90° — ширина й висота міняються місцями', () => {
    const b = labelBox({ ...L0, angle: 90 }, 100), h = labelHeight(L0);
    near(b.x1 - b.x0, h); near(b.y0 - b.y1, 100);
    /* лівий верхній кут до повороту (−w/2, +h/2) після повороту проти годинникової на 90° — ліворуч унизу */
    near(b.corners[0][0], 100 - h / 2); near(b.corners[0][1], 200 - 50);
  });
  it('45° — осьовий бокс більший за прямокутник', () => {
    const b = labelBox({ ...L0, angle: 45 }, 100), h = labelHeight(L0), d = (100 + h) / Math.SQRT2;
    near(b.x1 - b.x0, d); near(b.y0 - b.y1, d);
  });
});

describe('напис мапи: смужки для радара', () => {
  const px = (w: number, h: number, fill: (x: number, y: number) => number[] | null) => {
    const a = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fill(x, y); if (c) a.set([...c, 255], (y * w + x) * 4); }
    return a;
  };
  it('сусідні пікселі одного кольору — одна смужка; прозоре відкидається; метри за pxPerM', () => {
    const a = px(4, 1, x => (x < 3 ? [255, 255, 255] : null));
    const r = labelRuns(a, 4, 1, { x0: 10, y0: 20 }, 2);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ x0: 10, x1: 11.5, y0: 20, y1: 19.5, c: [255, 255, 255] });
  });
  it('інший колір (обводка) — окрема смужка', () => {
    const a = px(3, 1, x => (x === 1 ? [255, 255, 255] : [0, 0, 0]));
    expect(labelRuns(a, 3, 1, { x0: 0, y0: 0 }, 1).map(r => r.c)).toEqual([[0, 0, 0], [255, 255, 255], [0, 0, 0]]);
  });
  it('однакові смужки в сусідніх рядках зливаються, різні — ні', () => {
    const a = px(4, 3, (x, y) => (x < 2 ? [255, 255, 255] : y < 2 ? [0, 0, 0] : null));
    const runs = mergeRuns(labelRuns(a, 4, 3, { x0: 0, y0: 0 }, 1));
    expect(runs).toEqual([
      { x0: 0, x1: 2, y0: 0, y1: -3, c: [255, 255, 255] },
      { x0: 2, x1: 4, y0: 0, y1: -2, c: [0, 0, 0] },
    ]);
  });
  it('смужки по різні боки межі частин мапи — у різних частинах', () => {
    /* межа частин по x: -4500 + 1175·k; k = 4 → 200 */
    const runs = [{ x0: 190, x1: 199, y0: 5000, y1: 4999, c: [1, 2, 3] as [number, number, number] }, { x0: 201, x1: 210, y0: 5000, y1: 4999, c: [1, 2, 3] as [number, number, number] }];
    const m = splitBySupertile(runs);
    expect([...m.keys()].sort()).toEqual(['3_2', '4_2']);
  });
});

it('частини мапи — та сама формула, що в gameMap', () => {
  for (const [x, y] of [[0, 0], [199.9, 5000], [200, 5000], [-4140, 8400], [4800, -3500]]) expect(supertileAt(x, y)).toEqual(supertileOf(x, y));
});

describe('напис мапи: рядок бази', () => {
  it('туди й назад', () => {
    const l = labelFromRow({ id: 7, text: ' ФЕРМА ', x: 1.23, y: 4.56, color: '#FACC15', font: 'oswald', weight: 600, outline_color: '#000000', outline_w: 4, angle: 30.04, size: 60 });
    expect(l.id).toBe('label-7');
    expect(labelToRow(l)).toEqual({ text: 'ФЕРМА', x: 1.2, y: 4.6, color: '#facc15', font: 'oswald', weight: 600, outline_color: '#000000', outline_w: 4, angle: 30, size: 60 });
  });
});

describe('шрифти', () => {
  it('найближча доступна товщина', () => {
    expect(fontWeight('oswald', 800)).toBe(700);
    expect(fontWeight('russo-one', 700)).toBe(400);
    expect(fontWeight('невідомий', 700)).toBe(400);
  });
  it('id шрифтів проходять перевірку бази', () => {
    for (const f of LABEL_FONTS) expect(f.id).toMatch(/^[a-z0-9-]{2,40}$/);
  });
});
