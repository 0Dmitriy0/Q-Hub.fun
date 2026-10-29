import { describe, expect, it } from 'vitest';
import { nickError, nickLockedUntil } from './nick';

describe('нік акаунта', () => {
  it('підходить: D_VYRX, saha_23, з пробілами довкола', () => {
    for (const s of ['D_VYRX', 'saha_23', '  abc  ']) expect(nickError(s)).toBeNull();
  });
  it('не підходить: закороткий, задовгий, з пробілом, кирилиця, дефіс', () => {
    for (const s of ['ab', 'a'.repeat(21), 'd vyrx', 'Діма', 'D-VYRX', '']) expect(nickError(s)).toMatch(/3–20 символів/);
  });
  it('раз на 30 днів: змінений 10 днів тому — заблоковано до +30 днів; 31 день тому чи ніколи — можна', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(nickLockedUntil('2026-10-19T12:00:00Z', now)?.toISOString()).toBe('2026-11-18T12:00:00.000Z');
    expect(nickLockedUntil('2026-09-28T12:00:00Z', now)).toBeNull();
    expect(nickLockedUntil(null, now)).toBeNull();
  });
});
