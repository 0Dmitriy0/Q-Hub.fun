import { describe, expect, it } from 'vitest';
import { heroBanner, parseHint, showParam } from './halloween';

const on = (ghosts: number, pumpkins: number, ended = false) => ({ ghosts, pumpkins, ended });

describe('картка івенту на головній (specs/079)', () => {
  it('немає даних і підказки — картки немає (без блимання)', () => {
    expect(heroBanner(null, null)).toBeNull();
  });
  it('немає даних, є підказка з минулого візиту — картка з підказки', () => {
    expect(heroBanner(null, 'ghosts')).toBe('ghosts');
    expect(heroBanner(null, 'both')).toBe('both');
  });
  it('івент скінчився — картки немає, навіть з підказкою', () => {
    expect(heroBanner(on(10, 790, true), 'both')).toBeNull();
  });
  it('міток немає — картки немає', () => {
    expect(heroBanner(on(0, 0), 'ghosts')).toBeNull();
  });
  it('тип картки за мітками', () => {
    expect(heroBanner(on(0, 790), null)).toBe('pumpkins');
    expect(heroBanner(on(12, 0), null)).toBe('ghosts');
    expect(heroBanner(on(12, 790), null)).toBe('both');
  });
  it('посилання на мапу', () => {
    expect(showParam('ghosts')).toBe('pryvydy');
    expect(showParam('pumpkins')).toBe('harbuzy');
    expect(showParam('both')).toBe('pryvydy,harbuzy');
  });
  it('зіпсована підказка — ніби її немає', () => {
    expect(parseHint('xxx')).toBeNull();
    expect(parseHint(null)).toBeNull();
    expect(parseHint('pumpkins')).toBe('pumpkins');
  });
});
