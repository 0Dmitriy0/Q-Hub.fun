import { describe, expect, it } from 'vitest';
import { BRAND_SPOT, brandBox } from './mapBrand';
/* напис «ЧІЛІАД» зі старих назв мапи (до specs/089): центр і висота в метрах гри */
const chiliad = { x: 674.7, y: 5537.4, h: 35 };

describe('логотип Q-Hub на мапі', () => {
  it('квадрат зі стороною size навколо центру, верх — більший y', () => {
    expect(brandBox({ x: 0, y: 0, size: 100 })).toEqual({ x0: -50, y0: 50, x1: 50, y1: -50 });
  });
  it('стоїть під написом «ЧІЛІАД» і не налазить на нього', () => {
    const b = brandBox(BRAND_SPOT);
    expect(b.y0).toBeLessThan(chiliad.y - chiliad.h);
    expect(chiliad.x).toBeGreaterThan(b.x0 - 200);
    expect(chiliad.x).toBeLessThan(b.x1);
  });
});
