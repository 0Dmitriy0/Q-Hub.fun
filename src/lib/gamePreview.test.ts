import { describe, expect, it } from 'vitest';
import { GAME_BOUNDS, packSummary, pinRadius } from './gamePreview';
import { GAME } from './gameMap';

describe('перегляд «Мапи для гри» (specs/026)', () => {
  it('межі — 2×3 текстури по 4500 м від (-4140, 8400)', () => {
    expect(GAME_BOUNDS).toEqual({ x0: GAME.x0, x1: GAME.x0 + GAME.cols * GAME.tile, yt: GAME.yt, yb: GAME.yt - GAME.rows * GAME.tile });
  });
  it('значок у метрах: на z6 (1.28 px/м) 20 м — 25.6 px у діаметрі, кожен рівень удвічі', () => {
    expect(pinRadius(20, 6)).toBeCloseTo(12.8);
    expect(pinRadius(20, 7)).toBeCloseTo(25.6);
    expect(pinRadius(5, 2)).toBeCloseTo(0.2);
  });
  it('підсумок на кнопці: відмінки, поля й шари лише коли є', () => {
    expect(packSummary({ marks: 128, areas: 3, names: true, zones: false, theme: 'dark', iconM: 20 })).toBe('128 міток · 3 поля · назви · темна · 20 м');
    expect(packSummary({ marks: 1, areas: 0, names: false, zones: true, theme: 'light', iconM: 7 })).toBe('1 мітка · зелені зони · світла · 7 м');
    expect(packSummary({ marks: 22, areas: 11, names: false, zones: false, theme: 'dark', iconM: 12 })).toBe('22 мітки · 11 полів · темна · 12 м');
  });
});
