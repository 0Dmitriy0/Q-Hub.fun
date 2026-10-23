import { describe, expect, it } from 'vitest';
import { fromQuantFun, makeHash, parseHash, PX_PER_M, toGame, toPx } from './mapGeo';

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
  it('пікселі QuantFun -> координати гри', () => {
    expect(fromQuantFun(0, 0)).toEqual([-4141.6, 8403.6]);
    const [x, y] = fromQuantFun(1.81992 * 4141.618, 1.81992 * 8403.567);
    expect(x).toBeCloseTo(0, 0); expect(y).toBeCloseTo(0, 0);
  });
});
