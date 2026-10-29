/* specs/016: мапа не вилазить поверх закріпленої шапки. Leaflet ставить свої панелі на z-index 400–1000,
   тож контейнер кожної мапи мусить бути окремим шаром нижче за шапку */
import { describe, expect, it } from 'vitest';
import css from '../styles.css?raw';

/* тіло правила, що починає рядок: «.top { … }» */
const rule = (sel: string) => {
  const at = css.indexOf(`\n${sel} {`);
  if (at < 0) throw new Error(`немає правила ${sel}`);
  return css.slice(at, css.indexOf('}', at));
};
const z = (sel: string) => Number(/z-index:\s*(\d+)/.exec(rule(sel))?.[1] ?? NaN);

describe('шапка над мапою', () => {
  it('шапка закріплена й має свій шар', () => {
    expect(rule('.top')).toMatch(/position:\s*sticky/);
    expect(z('.top')).toBeGreaterThan(0);
  });

  it('міні-мапа головної — окремий шар', () => {
    expect(rule('.mini-map')).toMatch(/isolation:\s*isolate/);
  });

  it('повна мапа — шар нижче за шапку', () => {
    expect(rule('.mapfull')).toMatch(/position:\s*fixed/);
    expect(z('.mapfull')).toBeLessThan(z('.top'));
  });
});
