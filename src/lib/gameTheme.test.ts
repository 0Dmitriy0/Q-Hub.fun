import { describe, expect, it } from 'vitest';
import { recolor, recolorMesh, themed } from './gameTheme';

describe('тема мапи для гри', () => {
  const mesh = '-2182.0 5063.0 0.0 / 23 24 26 255\n-2216.0 5144.0 0.0 / 154 85 48 255\n1 2 0 / 30 42 49 128';

  it('темна — без жодної зміни (FR-008)', () => {
    expect(recolorMesh(mesh, 'dark')).toBe(mesh);
    expect(themed(['#17181a', '#9a5530'], 'dark')).toEqual(['#17181a', '#9a5530']);
  });

  it('світла: земля й море — світлі, дороги — як були, прозорість вершини лишається', () => {
    expect(recolorMesh(mesh, 'light')).toBe('-2182.0 5063.0 0.0 / 243 244 246 255\n-2216.0 5144.0 0.0 / 154 85 48 255\n1 2 0 / 178 204 224 128');
  });

  it('світла: білі назви — темні, тло поза мапою — як найглибше море', () => {
    expect(recolor('#FFFFFF', 'light')).toBe('#111111');
    expect(recolor('#0a0e11', 'light')).toBe('#8fb3cc');
    expect(recolor('#ff6a1f', 'light')).toBe('#ff6a1f');
    expect(recolor('#0d0d0d', 'light')).toBe('#f3f4f6');   // обводка назв
  });
});
