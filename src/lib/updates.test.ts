import { describe, expect, it } from 'vitest';
import { groupUpdates, type Update } from './updates';

const u = (id: number, who: string, buyer: string, item: number, at: string, cycle = '2026-10-21T15:00:00Z'): Update =>
  ({ id, buyer_id: buyer, item_id: item, price: 100, created_at: at, cycle, reporter_name: who });

describe('groupUpdates', () => {
  it('один гравець, один скупник, один цикл — один запис', () => {
    const g = groupUpdates([u(1, 'A', 'fish', 1, '2026-10-21T15:10:00Z'), u(2, 'A', 'fish', 2, '2026-10-21T15:12:00Z'), u(3, 'A', 'fish', 3, '2026-10-21T15:11:00Z')]);
    expect(g).toHaveLength(1);
    expect(g[0].items.map(x => x.item_id)).toEqual([1, 2, 3]);
    expect(g[0].at).toBe('2026-10-21T15:12:00Z');
  });
  it('різні гравці, скупники й цикли — окремо, найсвіжіше зверху', () => {
    const g = groupUpdates([
      u(1, 'A', 'fish', 1, '2026-10-21T15:10:00Z'), u(2, 'B', 'fish', 2, '2026-10-21T15:20:00Z'),
      u(3, 'A', 'wood', 5, '2026-10-21T15:15:00Z'), u(4, 'A', 'fish', 1, '2026-10-21T12:10:00Z', '2026-10-21T12:00:00Z')]);
    expect(g.map(x => x.who + ':' + x.buyer_id + ':' + x.items.length)).toEqual(['B:fish:1', 'A:wood:1', 'A:fish:1', 'A:fish:1']);
  });
});
