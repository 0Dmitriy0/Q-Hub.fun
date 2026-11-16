import { describe, expect, it } from 'vitest';
import { areaDashes, crc32, gamePx, makeZip, tileName } from './gameMap';

describe('карта для гри', () => {
  it('межі текстур гри: кут (-4140, 8400), 4500 м на тайл', () => {
    expect(gamePx(-4140, 8400, 512)).toEqual([0, 0]);
    expect(gamePx(-4140 + 9000, 8400 - 13500, 512)).toEqual([1024, 1536]);
    expect(tileName(2, 1)).toBe('minimap_2_1');
    expect(tileName(0, 1, 'minimap_sea_')).toBe('minimap_sea_0_1');
  });
  it('CRC-32 і zip без стиснення', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const z = makeZip([{ name: 'a.txt', data: new TextEncoder().encode('hi') }]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(1);
    expect(new TextDecoder().decode(z.slice(30 + 5, 30 + 7))).toBe('hi');
  });
});

import { IconMesh, iconRuns, meshText, oddText, odrText, readZip, supertileOf } from './gameMap';

describe('значки міток як у Hydra', () => {
  it('частина мапи за координатами (графіті з експорту Hydra лежить у minimap_3_4)', () => {
    expect(supertileOf(177, 1210)).toEqual([3, 4]);
    expect(supertileOf(-900, 7000)).toEqual([3, 0]);
    expect(supertileOf(1400, -3200)).toEqual([5, 8]);
  });
  it('растр іконки -> смужки одного кольору', () => {
    const px = new Uint8ClampedArray(2 * 2 * 4); px.set([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255]);
    const r = iconRuns(px, 2);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ x0: -0.5, x1: 0.5, y0: 0.5, y1: 0 });
    expect(r[1]).toMatchObject({ x0: 0, x1: 0.5 });
  });
  it('файли .mesh і .odr у форматі OpenFormats, як пише Hydra', () => {
    const m = new IconMesh(); m.add(177, 1210, 12, '#ff6a1f', [{ x0: -0.5, x1: 0.5, y0: 0.5, y1: -0.5, c: [255, 255, 255] }]);
    const { mesh, min, max } = meshText(m);
    expect(mesh.startsWith('Version 165 32\n{\n\tLocked false')).toBe(true);
    expect(mesh).toContain('\t\t\tVertexDeclaration NB60E6ACF\n');
    expect(mesh).toContain(`\t\t\tVertices ${m.v.length}\n`);
    expect(mesh).toMatch(/\t\t\t\t171\.0000000 1210\.0000000 17\.0000000 \/ 255 106 31 255/);
    expect(min[2]).toBe(17); expect(max[2]).toBeCloseTo(17.6);
    const odr = odrText('supertile_fore_3_4_tile_2_2', [171.2558899, 1204.4276123, 17], [182.7873993, 1216.895752, 17.6000004]);
    expect(odr).toContain('supertile_fore_3_4_tile_2_2\\supertile_fore_3_4_tile_2_2_high.mesh 0');
    expect(odr).toContain('Radius 8.49691');   // те саме число, що записала Hydra
  });
  it('zip читається назад без розпакування', () => {
    const z = makeZip([{ name: 'a/', data: new Uint8Array() }, { name: 'a/b.txt', data: new Uint8Array([1, 2, 3]), method: 8, crc: 7, size: 9 }]);
    const r = readZip(z);
    expect(r.map(e => e.name)).toEqual(['a/', 'a/b.txt']);
    expect(r[1]).toMatchObject({ method: 8, crc: 7, size: 9 }); expect([...r[1].data]).toEqual([1, 2, 3]);
  });
  it('.odd частини мапи — точнісінько як у Hydra після додавання значка', () => {
    expect(oddText('3_4', ['supertile_sea_3_4.odr', 'supertile_back_3_4.odr', 'supertile_fore_3_4_tile_0_0.odr', 'supertile_fore_3_4_tile_2_2.odr']))
      .toBe('Version 165 32\n{\n\tminimap_3_4\\supertile_back_3_4.odr\n\tminimap_3_4\\supertile_fore_3_4_tile_0_0.odr\n\tminimap_3_4\\supertile_fore_3_4_tile_2_2.odr\n\tminimap_3_4\\supertile_sea_3_4.odr\n}');
  });
});

describe('зони з бази (поля скарбів) — пунктирна межа', () => {
  const sq: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  it('штрихи 10 м через 6 м суцільно вздовж контуру', () => {
    const d = areaDashes(sq);
    expect(d.length).toBe(27);   // 400 м / 16 = 25 штрихів; кути на 100 і 200 м — посеред штриха (він двома шматками), на 300 м — пауза
    expect(d[0]).toEqual([[0, 1.5], [10, 1.5], [10, -1.5], [0, -1.5]]);
    expect(d[1][0][0]).toBeCloseTo(16);
  });
  it('усі штрихи — на межі, завширшки 3 м', () => {
    for (const q of areaDashes(sq)) {
      const w = Math.hypot(q[1][0] - q[2][0], q[1][1] - q[2][1]);
      expect(w).toBeCloseTo(3);
      const [mx, my] = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
      expect(Math.min(Math.abs(mx), Math.abs(mx - 100), Math.abs(my), Math.abs(my - 100))).toBeLessThan(0.01);
    }
  });
  it('повторені точки не ламають контур', () => expect(areaDashes([[0, 0], [0, 0], [32, 0], [32, 32]]).every(q => q.flat().every(Number.isFinite))).toBe(true));
});

/* нові локації (Деморган, військова база) — одразу над мапою, щоб написи й значки не ховались під ними */
import { lowerLocations, lowerZ, radarPxPerM } from './gameMap';
describe('шар нових локацій — під написами й значками', () => {
  const mesh = '\t\t\tMin 1.0000000 2.0000000 13.0000000\n\t\t\tMax 5.0000000 6.0000000 30.2000000\n\t\t\t\t1.0000000 2.0000000 30.0000000 / 154 85 48 255\n\t\t\t\t5.0000000 6.0000000 13.1000000 / 36 38 42 255';
  it('висоту 29–30 опускає до рівня мапи, решту не чіпає', () => {
    const t = lowerZ(mesh);
    expect(t).toContain('1.0000000 2.0000000 13.4000000 / 154 85 48 255');
    expect(t).toContain('5.0000000 6.0000000 13.1000000 / 36 38 42 255');
    expect(t).toContain('Max 5.0000000 6.0000000 13.6000000');
    expect(t).toContain('Min 1.0000000 2.0000000 13.0000000');
  });
  it('tile_2_2 стає tile_0_1 — у шляхах і всередині .odr', async () => {
    const enc = new TextEncoder(), dec = new TextDecoder(), f = (name: string, text = '') => ({ name, data: enc.encode(text) });
    const { entries, parts } = await lowerLocations([
      f('minimap_5_3/supertile_fore_5_3_tile_0_0.odr', 'base'),
      f('minimap_5_3/supertile_fore_5_3_tile_2_2.odr', 'supertile_fore_5_3_tile_2_2\supertile_fore_5_3_tile_2_2_high.mesh 0'),
      f('minimap_5_3/supertile_fore_5_3_tile_2_2/supertile_fore_5_3_tile_2_2_high.mesh', mesh),
    ]);
    expect(parts).toEqual(['5_3']);
    expect(entries.map(e => e.name)).toEqual(['minimap_5_3/supertile_fore_5_3_tile_0_0.odr', 'minimap_5_3/supertile_fore_5_3_tile_0_1.odr', 'minimap_5_3/supertile_fore_5_3_tile_0_1/supertile_fore_5_3_tile_0_1_high.mesh']);
    expect(entries.some(e => /tile_2_2/.test(e.name))).toBe(false);
    if (!entries[1].method) expect(dec.decode(entries[1].data)).toBe('supertile_fore_5_3_tile_0_1\supertile_fore_5_3_tile_0_1_high.mesh 0');
  });
  it('зайнятий tile_0_1 — шар лишається де був', async () => {
    const enc = new TextEncoder(), f = (name: string) => ({ name, data: enc.encode('x') });
    const { entries, parts } = await lowerLocations([f('minimap_1_3/supertile_fore_1_3_tile_0_1.odr'), f('minimap_1_3/supertile_fore_1_3_tile_2_2.odr')]);
    expect(parts).toEqual([]);
    expect(entries.map(e => e.name)).toContain('minimap_1_3/supertile_fore_1_3_tile_2_2.odr');
  });
  it('чіткість напису: дрібний — до 6 px на метр, великий — не менше 3', () => {
    expect(radarPxPerM(5)).toBe(6);
    expect(radarPxPerM(25)).toBe(4);
    expect(radarPxPerM(200)).toBe(3);
  });
});
