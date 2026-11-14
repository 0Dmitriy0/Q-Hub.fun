import { describe, expect, it } from 'vitest';
import { freshAsks } from './barReset';

type A = { q: string; reply: string; unseen?: boolean };

describe('нове відкриття Alt+Q (specs/082)', () => {
  it('порожньо — порожньо', () => {
    expect(freshAsks<A>([])).toEqual([]);
  });
  it('усе вже бачили — плашка чиста', () => {
    expect(freshAsks<A>([{ q: 'зелена зона', reply: '' }, { q: 'ДТП', reply: '', unseen: false }])).toEqual([]);
  });
  it('лишається лише непрочитана відповідь ШІ, без позначки', () => {
    const out = freshAsks<A>([{ q: 'а', reply: '1' }, { q: 'б', reply: '2', unseen: true }, { q: 'в', reply: '3' }]);
    expect(out).toEqual([{ q: 'б', reply: '2' }]);
    expect('unseen' in out[0]).toBe(false);
  });
  it('кілька непрочитаних — у тому ж порядку', () => {
    expect(freshAsks<A>([{ q: 'б', reply: '', unseen: true }, { q: 'а', reply: '' }, { q: 'в', reply: '', unseen: true }]).map(a => a.q)).toEqual(['б', 'в']);
  });
  it('вхід не змінюється', () => {
    const src: A[] = [{ q: 'б', reply: '', unseen: true }];
    freshAsks(src);
    expect(src).toEqual([{ q: 'б', reply: '', unseen: true }]);
  });
});
