import { describe, expect, it } from 'vitest';
import { makeHash, parseHash, PX_PER_M, toGame, toPx } from './mapGeo';

describe('координати карти', () => {
  it('1.28 px на метр і туди-назад без втрат', () => {
    expect(PX_PER_M).toBeCloseTo(1.28);
    const [px, py] = toPx(200, -900); const [x, y] = toGame(px, py);
    expect(x).toBeCloseTo(200); expect(y).toBeCloseTo(-900);
  });
  it('північ угорі: більший Y гри — менший піксель', () => {
    expect(toPx(0, 6000)[1]).toBeLessThan(toPx(0, -2000)[1]);
  });
  it('посилання на точку', () => {
    expect(parseHash(makeHash(200.4, -899.6, 5))).toEqual({ x: 200, y: -900, z: 5 });
    expect(parseHash('#12,-34')).toEqual({ x: 12, y: -34, z: 6 });
    expect(parseHash('#abc')).toBeNull();
  });
});
