import { beforeEach, describe, expect, it, vi } from 'vitest';
import { builtinGlossary, GLOSSARY_TTL, loadGlossary } from './glossary';

/* міграцію читаємо як текст (CI-tsc не знає node:fs — пам'ять tests-no-node-fs) */
const SQL = Object.values(import.meta.glob('../../supabase/migrations/0080_glossary.sql', { query: '?raw', import: 'default', eager: true }))[0] as string;

describe('вбудований глосарій = початковий список міграції 0080', () => {
  it('ті самі терміни (скорочення + повна назва), пояснення в межах', () => {
    const seed = [...SQL.matchAll(/^\s*\('([^']+)', array\[[^\]]*\](?:::text\[\])?, '([^']*)', '/gm)].map(m => `${m[1]}|${m[2]}`).sort();
    const json = builtinGlossary().map(t => `${t.term}|${t.full_name}`).sort();
    expect(seed.length).toBeGreaterThanOrEqual(20);
    expect(json).toEqual(seed);
    for (const t of builtinGlossary()) {
      expect(t.term.trim().length, t.term).toBeGreaterThan(0);
      expect(t.term.length, t.term).toBeLessThanOrEqual(12);
      expect(t.description.trim().length, t.term).toBeGreaterThan(0);
      expect(t.description.length, t.term).toBeLessThanOrEqual(300);
    }
  });
});

describe('loadGlossary: база → кеш 10 хв → вбудований', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } });
  });
  const row = (term: string) => ({ term, aliases: [], full_name: '', description: 'x', related_rules: [] });

  it('з бази — і в кеш; повтор раніше 10 хв — без запиту', async () => {
    const fetchRows = vi.fn(async () => [row('НОВ')]);
    expect((await loadGlossary({ now: 1000, fetchRows })).map(t => t.term)).toEqual(['НОВ']);
    expect((await loadGlossary({ now: 1000 + GLOSSARY_TTL - 1, fetchRows })).map(t => t.term)).toEqual(['НОВ']);
    expect(fetchRows).toHaveBeenCalledTimes(1);
    await loadGlossary({ now: 1000 + GLOSSARY_TTL + 1, fetchRows });
    expect(fetchRows).toHaveBeenCalledTimes(2);
  });
  it('без мережі — останній кеш (прибране не повертається з вбудованого)', async () => {
    await loadGlossary({ now: 0, fetchRows: async () => [row('ЛИШ')] });
    const r = await loadGlossary({ now: GLOSSARY_TTL * 2, fetchRows: async () => { throw new Error('offline'); } });
    expect(r.map(t => t.term)).toEqual(['ЛИШ']);
  });
  it('без мережі й без кешу — вбудований', async () => {
    const r = await loadGlossary({ now: 0, fetchRows: async () => null });
    expect(r).toEqual(builtinGlossary());
  });
  it('сховище недоступне — усе одно працює', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect((await loadGlossary({ now: 0, fetchRows: async () => [row('А')] })).map(t => t.term)).toEqual(['А']);
  });
});
