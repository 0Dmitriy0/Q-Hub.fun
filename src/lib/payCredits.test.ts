import { describe, expect, it } from 'vitest';
import { partKey, payCredits, splitPay, type PayVersion } from './payCredits';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const D = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const v = (no: number, kind: string, pay: string, author: string | null, decided: string | null, daysAgo: number): PayVersion =>
  ({ version_no: no, kind, author, decided_by: decided, created_at: D(daysAgo), pay });

describe('splitPay / partKey (specs/087)', () => {
  it('частини — за « · » чи новим рядком, без порожніх', () => {
    expect(splitPay('Пшениця: ≈30 000 $/год · Гарбузи: ≈25 000 $/год\n\nРівень 3: ≈40 000 $/год ')).toEqual(['Пшениця: ≈30 000 $/год', 'Гарбузи: ≈25 000 $/год', 'Рівень 3: ≈40 000 $/год']);
    expect(splitPay('')).toEqual([]);
    expect(splitPay('   ')).toEqual([]);
  });
  it('ключ — до двокрапки в перших 40 знаках, інакше весь текст', () => {
    expect(partKey(' Пшениця: ≈30 000 $/год')).toBe('пшениця');
    expect(partKey('Рівень 3: ≈40 000')).toBe('рівень 3');
    expect(partKey('від 500 $ за рейс')).toBe('від 500 $ за рейс');
    expect(partKey('дуже довгий текст без двокрапки на початку, а потім: щось')).toBe('дуже довгий текст без двокрапки на початку, а потім: щось');
  });
});

describe('payCredits', () => {
  it('кожна частина — своя версія; зміна іншої частини не міняє кредит', () => {
    const vs = [
      v(1, 'seed', 'від 1 500 $ за збір', null, null, 60),
      v(2, 'accept', 'від 1 500 $ за збір · Пшениця: ≈30 000 $/год', 'anna', 'mod', 10),
      v(3, 'accept', 'від 1 500 $ за збір · Пшениця: ≈30 000 $/год · Гарбузи: ≈25 000 $/год', 'bob', 'mod', 2),
      v(4, 'accept', 'від 1 500 $ за збір · Пшениця: ≈30 000 $/год · Гарбузи: ≈25 000 $/год', 'carl', 'mod', 1),   // правка опису — pay той самий
    ];
    const r = payCredits(vs, 'від 1 500 $ за збір · Пшениця: ≈30 000 $/год · Гарбузи: ≈25 000 $/год', NOW);
    expect(r.map(p => [p.key, p.kind, p.by, p.approvedBy])).toEqual([
      ['від 1 500 $ за збір', 'seed', null, null],
      ['пшениця', 'proposal', 'anna', 'mod'],
      ['гарбузи', 'proposal', 'bob', 'mod'],
    ]);
    expect(r[0].at).toBe(D(60));   // дата завантаження початкових даних — для «давно»
    expect(r[1].at).toBe(D(10));
  });

  it('заміна частини — новий кредит; відкат — кредит першої появи', () => {
    const vs = [
      v(1, 'accept', 'Пшениця: ≈30 000 $/год', 'anna', 'mod', 20),
      v(2, 'accept', 'Пшениця: ≈34 000 $/год', 'bob', 'mod', 5),
    ];
    expect(payCredits(vs, 'Пшениця: ≈34 000 $/год', NOW)[0].by).toBe('bob');
    const back = [...vs, v(3, 'revert', 'Пшениця: ≈30 000 $/год', 'mod', 'mod', 1)];
    const r = payCredits(back, 'Пшениця: ≈30 000 $/год', NOW)[0];
    expect(r.by).toBe('anna');
    expect(r.at).toBe(D(20));
  });

  it('порядок версій на вході не важливий; hide/unhide пропускаються', () => {
    const vs = [
      v(3, 'hide', '', 'mod', 'mod', 1),
      v(2, 'accept', 'Пшениця: ≈30 000 $/год', 'anna', 'mod', 3),
      v(1, 'seed', 'Пшениця: старе', null, null, 90),
      v(4, 'unhide', '', 'mod', 'mod', 0),
    ];
    expect(payCredits(vs, 'Пшениця: ≈30 000 $/год', NOW)[0].by).toBe('anna');
  });

  it('модератор = автор — без «підтвердив»; admin — «додав»', () => {
    expect(payCredits([v(1, 'accept', 'Рівень 1: ≈10 000', 'mod', 'mod', 1)], 'Рівень 1: ≈10 000', NOW)[0].approvedBy).toBeNull();
    const a = payCredits([v(1, 'admin', 'Рівень 1: ≈10 000', null, 'boss', 1)], 'Рівень 1: ≈10 000', NOW)[0];
    expect([a.kind, a.by]).toEqual(['admin', 'boss']);
  });

  it('давно — лише з відомою датою старше 30 днів; початкові дані — від дати завантаження', () => {
    const vs = [v(1, 'seed', 'від 500 $', null, null, 100), v(2, 'accept', 'від 500 $ · Рівень 2: ≈20 000', 'anna', 'mod', 31), v(3, 'accept', 'від 500 $ · Рівень 2: ≈20 000 · Рівень 3: ≈30 000', 'bob', 'mod', 29)];
    expect(payCredits(vs, 'від 500 $ · Рівень 2: ≈20 000 · Рівень 3: ≈30 000', NOW).map(p => p.stale)).toEqual([true, true, false]);
  });

  it('pay останньої версії ≠ теперішній — порожньо; порожній pay — порожньо', () => {
    expect(payCredits([v(1, 'accept', 'Рівень 1: ≈10 000', 'a', 'm', 1)], 'Рівень 1: ≈12 000', NOW)).toEqual([]);
    expect(payCredits([v(1, 'accept', '', 'a', 'm', 1)], '', NOW)).toEqual([]);
    expect(payCredits([], 'Рівень 1', NOW)).toEqual([{ text: 'Рівень 1', key: 'рівень 1', kind: 'seed', by: null, approvedBy: null, at: null, stale: false }]);   // історії немає — з початкових даних, без «давно»
  });

  it('заробіток одним рядком: зміна тексту — новий кредит, зміна інших полів — ні', () => {
    const vs = [v(1, 'seed', 'від 500 $ за рейс', null, null, 50), v(2, 'accept', 'від 700 $ за рейс', 'vira', 'mod', 4), v(3, 'accept', 'від 700 $ за рейс', 'ivan', 'mod', 1)];
    const r = payCredits(vs, 'від 700 $ за рейс', NOW);
    expect(r).toHaveLength(1);
    expect([r[0].kind, r[0].by]).toEqual(['proposal', 'vira']);
  });

  it('не кидає на сміттєвому вході', () => {
    expect(() => payCredits([{ version_no: NaN, kind: 'x', author: null, decided_by: null, created_at: 'щось', pay: null as unknown as string }], 'a', NOW)).not.toThrow();
    expect(() => payCredits(null as unknown as PayVersion[], 'a', NOW)).not.toThrow();
  });
});

describe('«давно» для початкових даних', () => {
  it('початкові дані тижневої давнини — не давно; 40-денної — давно', () => {
    expect(payCredits([v(1, 'seed', 'від 500 $', null, null, 6)], 'від 500 $', NOW)[0].stale).toBe(false);
    expect(payCredits([v(1, 'seed', 'від 500 $', null, null, 40)], 'від 500 $', NOW)[0].stale).toBe(true);
  });
});
