/* Записи живої гри (desktop/src/fixtures/prices) через увесь шлях програми: parseShot → pricePicker → coverage (specs/024).
   Тут, а не в desktop/*.test.cjs: там тести йдуть до збірки, і lib/shotparse.cjs ще немає (коміт 33b5e12) */
import { describe, expect, it } from 'vitest';
import { MIN_SCORE, parseShot, type OcrLine } from './shotParse';
import { coverage, pricePicker, type Sent } from '../../desktop/src/pricescan.cjs';
import hideFull from '../../desktop/src/fixtures/prices/hide-full.json';
import hidePartial from '../../desktop/src/fixtures/prices/hide-partial.json';
import junkFull from '../../desktop/src/fixtures/prices/junk-full.json';
import junkFast from '../../desktop/src/fixtures/prices/junk-fast.json';
import fishFull from '../../desktop/src/fixtures/prices/fish-full.json';

interface Fixture {
  buyer: string;
  items: { id: number; name: string; min: number; max: number }[];
  expect: Record<string, number>;   // item_id → ціна, яку має надіслати програма
  unsure: number[];                 // зчитки розходяться — еталону немає
  frames: { t: number; lines: OcrLine[] }[];
}

function replay(fx: Fixture) {
  const items = fx.items.map(i => ({ ...i, buyer_id: fx.buyer }));
  const pick = pricePicker(), cov = coverage(), sent: Sent[] = [];
  let last = null;
  for (const fr of fx.frames) {
    const rows = parseShot(fr.lines, items)
      .filter(r => r.item && r.price && r.score >= MIN_SCORE)
      .map(r => {
        const it = items.find(i => i.id === r.item!.id)!;
        return { buyer_id: fx.buyer, item_id: it.id, price: r.price!, score: r.score, min: it.min, max: it.max };
      });
    sent.push(...pick(fx.buyer, rows, fr.t));
    last = cov.frame(fx.buyer, items.length, rows.map(r => r.item_id), pick.confirmed, fr.t);
  }
  return { sent, cover: last! };
}

const all = { hideFull, hidePartial, junkFull, junkFast, fishFull } as Record<string, Fixture>;

describe('записи вікон скупників (жива гра 2026-10-29)', () => {
  for (const [name, fx] of Object.entries(all)) {
    it(`${name}: жодної ціни поза межами, надіслане збігається з еталоном`, () => {
      const { sent } = replay(fx);
      const by = new Map(fx.items.map(i => [i.id, i]));
      const outside = sent.filter(s => { const i = by.get(s.item_id)!; return i.max > i.min && (s.price < i.min || s.price > i.max); });
      expect(outside).toEqual([]);
      for (const s of sent) if (!fx.unsure.includes(s.item_id)) expect([s.item_id, s.price]).toEqual([s.item_id, fx.expect[s.item_id]]);
    });
  }

  it('«Шкури»: прокрутив до кінця — 32 з 32; без прокручування — менше', () => {
    expect(replay(hideFull as Fixture).cover).toMatchObject({ read: 32, total: 32, pending: 0 });
    expect(replay(hidePartial as Fixture).cover.read).toBeLessThan(32);
  });

  it('«Мотлох»: швидке прокручування не дає інших цін, ніж повне', () => {
    const fast = replay(junkFast as Fixture).sent, full = new Map(replay(junkFull as Fixture).sent.map(s => [s.item_id, s.price]));
    for (const s of fast) expect([s.item_id, s.price]).toEqual([s.item_id, full.get(s.item_id)]);
  });
});
