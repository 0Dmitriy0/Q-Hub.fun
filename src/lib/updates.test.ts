import { describe, expect, it } from 'vitest';
import { groupUpdates, who, type Update } from './updates';

const u = (id: number, nick: string, char: string | null, buyer: string, item: number, at: string): Update =>
  ({ id, buyer_id: buyer, item_id: item, price: 100, created_at: at, reporter_id: 'acc-' + nick, reporter_name: nick, reporter_character: char });

describe('groupUpdates', () => {
  it('один гравець, один скупник, одним заходом — один запис «нік · персонаж»', () => {
    const g = groupUpdates([u(1, 'D_VYRX', 'Dmitriy_Core', 'fish', 1, '2026-10-21T15:10:00Z'), u(2, 'D_VYRX', 'Dmitriy_Core', 'fish', 2, '2026-10-21T15:32:00Z'), u(3, 'D_VYRX', 'Dmitriy_Core', 'fish', 3, '2026-10-21T15:20:00Z')]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ who: 'D_VYRX · Dmitriy_Core', at: '2026-10-21T15:32:00Z' });
    expect(g[0].items.map(x => x.item_id).sort()).toEqual([1, 2, 3]);
  });
  it('перерва понад 30 хв, інший гравець чи скупник — окремі записи, найсвіжіше зверху', () => {
    const g = groupUpdates([
      u(1, 'A', 'A_Char', 'fish', 1, '2026-10-21T15:10:00Z'), u(2, 'B', 'B_Char', 'fish', 2, '2026-10-21T15:20:00Z'),
      u(3, 'A', 'A_Char', 'wood', 5, '2026-10-21T15:15:00Z'), u(4, 'A', 'A_Char', 'fish', 1, '2026-10-21T14:00:00Z')]);
    expect(g.map(x => x.who + ':' + x.buyer_id + ':' + x.items.length)).toEqual(['B · B_Char:fish:1', 'A · A_Char:wood:1', 'A · A_Char:fish:1', 'A · A_Char:fish:1']);
  });
  it('той самий акаунт з двох персонажів — окремі записи', () => {
    const g = groupUpdates([u(1, 'D_VYRX', 'Dmitriy_Core', 'fish', 1, '2026-10-21T15:10:00Z'), u(2, 'D_VYRX', 'Jacson_Core', 'fish', 2, '2026-10-21T15:12:00Z')]);
    expect(g.map(x => x.who)).toEqual(['D_VYRX · Jacson_Core', 'D_VYRX · Dmitriy_Core']);
  });
});

describe('who', () => {
  it('стара ціна без персонажа — лише нік; без ніка — «гравець»', () => {
    expect(who({ reporter_name: 'D_VYRX', reporter_character: null })).toBe('D_VYRX');
    expect(who({ reporter_name: ' ', reporter_character: null })).toBe('гравець');
  });
});
