import { describe, expect, it } from 'vitest';
import { ANIMALS, animalSpots, inRing, isAnimal, sortAnimals, type Pt } from './huntAnimals';

/* контури 6 полів — з того самого сіду, що йде в базу (без node:fs: CI-tsc не знає типів Node) */
const sql = Object.values(import.meta.glob('/supabase/seed/map_hunting_fields.sql', { query: '?raw', import: 'default', eager: true }))[0] as string;
const fields = [...sql.matchAll(/\('(Поле полювання \d+)', '(\[\[.*?\]\])'\)/g)].map(m => ({ name: m[1], ring: JSON.parse(m[2]) as Pt[] }));

describe('huntAnimals', () => {
  it('8 видів з назвами', () => {
    expect(ANIMALS.map(a => a.id)).toEqual(['rabbit', 'cow', 'pig', 'coyote', 'deer', 'puma', 'panther', 'boar']);
    expect(ANIMALS.find(a => a.id === 'rabbit')?.name).toBe('Заєць');
    expect(isAnimal('puma')).toBe(true);
    expect(isAnimal('wolf')).toBe(false);
  });

  it('sortAnimals відкидає невідоме й повтори, тримає порядок', () => {
    expect(sortAnimals(['boar', 'wolf', 'rabbit', 'boar'])).toEqual(['rabbit', 'boar']);
    expect(sortAnimals([])).toEqual([]);
  });

  it('сід має 6 полів', () => expect(fields.map(f => f.name)).toHaveLength(6));

  for (const step of [60, 120]) for (const f of fields) it(`${f.name}: 1–8 звірів усередині, крок ${step} м`, () => {
    for (let n = 1; n <= 8; n++) {
      const pts = animalSpots(f.ring, n, step);
      expect(pts).toHaveLength(n);
      for (const p of pts) expect(inRing(p, f.ring)).toBe(true);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])).toBeGreaterThanOrEqual(step - 1e-6);
      expect(animalSpots(f.ring, n, step)).toEqual(pts);
    }
  });

  it('порожньо — порожньо', () => {
    expect(animalSpots(fields[0].ring, 0, 60)).toEqual([]);
    expect(animalSpots([[0, 0], [1, 1]], 3, 60)).toEqual([]);
  });

  it('увігнуте поле: точки не в «дірці» центру мас', () => {
    const u: Pt[] = [[0, 0], [300, 0], [300, 300], [200, 300], [200, 100], [100, 100], [100, 300], [0, 300]];
    for (const p of animalSpots(u, 3, 20)) expect(inRing(p, u)).toBe(true);
  });
});

import { ANIMAL_SCALES, animalLayout } from './huntAnimals';
describe('звірі на мапі для гри — більші за мітку', () => {
  it('на справжніх полях — найбільший множник і всі всередині поля', () => {
    for (const f of fields) for (const n of [3, 5]) {
      const { spots, k } = animalLayout(f.ring, n, 20);
      expect(k).toBe(ANIMAL_SCALES[0]);
      expect(spots).toHaveLength(n);
      for (const p of spots) expect(inRing(p, f.ring)).toBe(true);
    }
  });
  it('у тісному полі множник зменшується, але іконки лишаються', () => {
    const small: Pt[] = [[0, 0], [150, 0], [150, 60], [0, 60]];
    const { spots, k } = animalLayout(small, 4, 20);
    expect(k).toBeLessThan(ANIMAL_SCALES[0]);
    expect(spots).toHaveLength(4);
  });
});

/* місце звірів, яке вказав адмін (map_areas.animals_at, 0074) */
import { animalAnchor, isPt } from './huntAnimals';
describe('місце звірів, вказане адміном', () => {
  const sq: Pt[] = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]];
  it('без точки — як раніше; з точкою — сітка з центром у ній', () => {
    expect(animalAnchor(sq, null)).toEqual([500, 500]);
    expect(animalAnchor(sq, [100, 200])).toEqual([100, 200]);
    const { spots, k } = animalLayout(sq, 3, 20, [700, 300]);
    expect(k).toBe(5);
    expect(spots).toHaveLength(3);
    expect(spots.reduce((a, p) => a + p[0], 0) / 3).toBeCloseTo(700);
    expect(spots.every(p => p[1] === 300)).toBe(true);
  });
  it('біля межі значки меншають, щоб лишитись у полі; поза полем — звичайний розмір у точці', () => {
    const near = animalLayout(sq, 3, 20, [30, 30]);
    expect(near.k).toBeLessThan(5);
    expect(near.spots.every(p => inRing(p, sq))).toBe(true);
    const out = animalLayout(sq, 2, 20, [-300, 500]);
    expect(out.k).toBe(1);
    expect(out.spots.map(p => p[1])).toEqual([500, 500]);
  });
  it('isPt приймає лише пару чисел', () => {
    expect(isPt([1, 2])).toBe(true);
    for (const v of [null, [1], [1, '2'], [1, NaN], 'x', [1, 2, 3]]) expect(isPt(v)).toBe(false);
  });
});
