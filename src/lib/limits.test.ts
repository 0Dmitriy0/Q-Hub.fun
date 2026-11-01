import { describe, expect, it } from 'vitest';
import { widen } from './limits';

describe('widen', () => {
  it('ціна вище максимуму — максимум до ціни + 10 %, мінімум не чіпаємо (Пластина 356 при 113–325)', () => {
    expect(widen(113, 325, 356)).toEqual({ min: 113, max: 392 });
  });
  it('ціна нижче мінімуму — мінімум до ціни − 10 % (Ключка 50 при 144–299)', () => {
    expect(widen(144, 299, 50)).toEqual({ min: 45, max: 299 });
  });
  it('ціна в межах чи межі не задані — без змін; ніколи не звужує', () => {
    expect(widen(100, 300, 200)).toEqual({ min: 100, max: 300 });
    expect(widen(0, 0, 200)).toEqual({ min: 0, max: 0 });
    expect(widen(100, 300, 0)).toEqual({ min: 100, max: 300 });
  });
  it('мінімум не менше 1', () => {
    expect(widen(5, 10, 1)).toEqual({ min: 1, max: 10 });
  });
});
