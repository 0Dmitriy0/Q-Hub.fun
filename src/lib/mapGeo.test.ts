import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromQuantFun, makeHash, parseHash, PX_PER_M, toGame, toPx, fromOpenHydra } from './mapGeo';

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

/* specs/017 FR-005: 10 контрольних місць у різних кутках штату — стікер Open Hydra Map проти тієї ж точки на тайлах Hydra */
describe('Open Hydra Map -> гра', () => {
  const CTRL: [[number, number], [number, number]][] = [[[-3205.5,-747.3],[-3429,946]],[[3205.5,1793.1],[2990,3490]],[[1151.5,-4946],[933,-3257]],[[602.3,4946],[384,6646]],[[-1037.7,-3605.8],[-1258,-1916]],[[2021.4,4716.9],[1804,6417]],[[-161.8,4483.2],[-381,6184]],[[1199.7,-4177.4],[982,-2488]],[[354.9,4928.7],[137,6630]],[[2226.9,2059.7],[2011,3757]]];
  it.each(CTRL)('%j -> %j, похибка не більше 5 м', (ohm, game) => {
    const [x, y] = fromOpenHydra(ohm[0], ohm[1]);
    expect(Math.hypot(x - game[0], y - game[1])).toBeLessThanOrEqual(5);
  });
});

describe('файли мапи й кадр у вікні програми (specs/014)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('на сайті — шлях сайту, у вікні з file:// — протокол програми qmap://', async () => {
    const site = await import('./mapGeo');
    expect(site.mapUrl('/map/v/index.json')).toBe(`/map/v/index.json?v=${site.MAP_V}`);
    vi.resetModules(); vi.stubGlobal('location', { protocol: 'file:' });
    const app = await import('./mapGeo');
    expect(app.mapUrl('/map/v/index.json')).toBe(`qmap://site/map/v/index.json?v=${app.MAP_V}`);
  });

  it('кадр: зберігається округленим, биті дані й порожньо — null', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } });
    const { readView, saveView } = await import('./mapGeo');
    expect(readView()).toBeNull();
    saveView(-150.4, 1000.6, 5.5);
    expect(readView()).toEqual({ x: -150, y: 1001, z: 5.5 });
    store.set('qhub:map:view', '{"x":1,"y":"a","z":3}'); expect(readView()).toBeNull();
    store.set('qhub:map:view', 'не json'); expect(readView()).toBeNull();
  });
});
