import { describe, expect, it } from 'vitest';
import {
  currentMonth, discordAnnouncement, escapeDiscord, periodLabel, previousMonth, toCsv, validPeriod, winnerTemplate, type TopRow,
} from './activityStats';

const row = (category: TopRow['category'], place: number, nick: string | null, cnt: number): TopRow =>
  ({ category, place, userId: `u${category}${place}`, nick, cnt, reachedAt: '2026-11-05T10:00:00Z' });

describe('період за Києвом', () => {
  it('межа місяця — за київським, а не UTC часом', () => {
    // 31.10 22:30 UTC = 1 листопада 00:30 у Києві (EET, UTC+2)
    expect(currentMonth(new Date('2026-10-31T22:30:00Z'))).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(currentMonth(new Date('2026-10-31T21:30:00Z'))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('попередній місяць із січня — грудень минулого року; лютий високосного', () => {
    expect(previousMonth(new Date('2027-01-10T12:00:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(previousMonth(new Date('2028-03-10T12:00:00Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
  it('назва періоду', () => {
    expect(periodLabel({ from: '2026-11-01', to: '2026-11-30' })).toBe('листопад 2026');
    expect(periodLabel({ from: '2026-11-05', to: '2026-11-12' })).toBe('5–12 листопада 2026');
    expect(periodLabel({ from: '2026-11-05', to: '2026-11-05' })).toBe('5 листопада 2026');
    expect(periodLabel({ from: '2026-10-28', to: '2026-11-03' })).toBe('28 жовтня – 3 листопада 2026');
    expect(periodLabel({ from: '2026-12-20', to: '2027-01-05' })).toBe('20 грудня 2026 – 5 січня 2027');
  });
  it('період не навиворіт і не довший за рік', () => {
    expect(validPeriod({ from: '2026-11-01', to: '2026-11-30' })).toBe(true);
    expect(validPeriod({ from: '2026-11-30', to: '2026-11-01' })).toBe(false);
    expect(validPeriod({ from: '2026-01-01', to: '2027-01-01' })).toBe(true);    // 366 днів включно
    expect(validPeriod({ from: '2026-01-01', to: '2027-01-02' })).toBe(false);
    expect(validPeriod({ from: '', to: '2026-11-01' })).toBe(false);
  });
});

describe('текст для Discord', () => {
  it('нік буквально: розмітка екранована, @ не пінгує', () => {
    expect(escapeDiscord('a_b*c')).toBe('a\\_b\\*c');
    expect(escapeDiscord('~`|>#[x]\\')).toBe('\\~\\`\\|\\>\\#\\[x\\]\\\\');
    expect(escapeDiscord('@everyone')).toBe('@​everyone');
  });
  it('топ-3 з медалями, менше гравців і порожня категорія', () => {
    const rows = [row('prices', 1, 'Ivan_Petrenko', 40), row('prices', 2, 'Olena', 31), row('prices', 3, 'X', 20), row('prices', 4, 'Зайвий', 1),
      row('marks', 1, null, 7)];
    const [text, ...rest] = discordAnnouncement(rows, { from: '2026-11-01', to: '2026-11-30' });
    expect(rest).toEqual([]);
    expect(text).toContain('Активність на Q-Hub — листопад 2026');
    expect(text).toContain('🥇 Ivan\\_Petrenko — 40');
    expect(text).toContain('🥉 X — 20');
    expect(text).not.toContain('Зайвий');
    expect(text).toContain('**Мітки на мапі**\n🥇 без ніку — 7');
    expect(text).toContain('**Гайди**\n— немає учасників');
    expect(text).not.toMatch(/@(everyone|here)/);
  });
  it('звичайний місяць — одне повідомлення ≤ 2000', () => {
    const rows = (['prices', 'marks', 'guides'] as const).flatMap(c => [1, 2, 3].map(p => row(c, p, 'N'.repeat(32), 999)));
    const parts = discordAnnouncement(rows, { from: '2026-11-01', to: '2026-11-30' });
    expect(parts).toHaveLength(1);
    expect(parts[0].length).toBeLessThanOrEqual(2000);
  });
  it('задовге — кілька частин, кожна ≤ ліміту, категорія не рветься', () => {
    const rows = (['prices', 'marks', 'guides'] as const).flatMap(c => [1, 2, 3].map(p => row(c, p, 'N'.repeat(32), 1)));
    const parts = discordAnnouncement(rows, { from: '2026-11-01', to: '2026-11-30' }, 260);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(260);
    for (const label of ['Ціни скупників', 'Мітки на мапі', 'Гайди']) {
      const part = parts.find(p => p.includes(`**${label}**`))!;
      expect(part.split(`**${label}**`)[1]).toContain('🥉');
    }
  });
});

describe('CSV', () => {
  it('BOM, «;», лапки подвоєні, порядок категорій і місць', () => {
    const csv = toCsv([row('guides', 1, 'Нік "лапки"', 2), row('prices', 2, 'B', 5), row('prices', 1, 'A', 9)]);
    expect(csv.startsWith('﻿"Категорія";"Місце";"Нік";"Кількість"\r\n')).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[1]).toBe('"Ціни скупників";"1";"A";"9"');
    expect(lines[2]).toBe('"Ціни скупників";"2";"B";"5"');
    expect(lines[3]).toBe('"Гайди";"1";"Нік ""лапки""";"2"');
  });
});

describe('шаблон переможцю', () => {
  it('нік, категорія, місце, період; без ніку — «гравцю»', () => {
    const t = winnerTemplate('Ivan', 'guides', 1, { from: '2026-10-01', to: '2026-10-31' });
    expect(t.title).toBe('🏆 1 місце: Гайди — жовтень 2026');
    expect(t.body).toContain('Вітаємо, Ivan!');
    expect(t.body).toContain('1 місце в категорії «Гайди» за жовтень 2026');
    expect(winnerTemplate(null, 'prices', 3, { from: '2026-10-01', to: '2026-10-31' }).body).toContain('Вітаємо, гравцю!');
    expect(t.title.length).toBeLessThanOrEqual(120);
  });
});
