import { describe, expect, it } from 'vitest';
import { crc32, gamePx, makeZip, tileName } from './gameMap';

describe('карта для гри', () => {
  it('межі текстур гри: кут (-4140, 8400), 4500 м на тайл', () => {
    expect(gamePx(-4140, 8400, 512)).toEqual([0, 0]);
    expect(gamePx(-4140 + 9000, 8400 - 13500, 512)).toEqual([1024, 1536]);
    expect(tileName(2, 1)).toBe('minimap_2_1.png');
    expect(tileName(0, 1, 'minimap_sea_')).toBe('minimap_sea_0_1.png');
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
