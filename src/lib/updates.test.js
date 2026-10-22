import { describe, expect, it } from 'vitest';
import { groupUpdates } from './updates';
const u = (id, game, stat, buyer, item, at) => ({ id, buyer_id: buyer, item_id: item, price: 100, created_at: at, reporter_name: 'discord', reporter_game: game, reporter_static: stat });
describe('groupUpdates', () => {
    it('один гравець, один скупник, одним заходом — один запис з ніком персонажа і статіком', () => {
        const g = groupUpdates([u(1, 'Ivan_Petrov', 7, 'fish', 1, '2026-10-21T15:10:00Z'), u(2, 'Ivan_Petrov', 7, 'fish', 2, '2026-10-21T15:32:00Z'), u(3, 'Ivan_Petrov', 7, 'fish', 3, '2026-10-21T15:20:00Z')]);
        expect(g).toHaveLength(1);
        expect(g[0]).toMatchObject({ who: 'Ivan_Petrov', stat: 7, at: '2026-10-21T15:32:00Z' });
        expect(g[0].items.map(x => x.item_id).sort()).toEqual([1, 2, 3]);
    });
    it('перерва понад 30 хв, інший гравець чи скупник — окремі записи, найсвіжіше зверху', () => {
        const g = groupUpdates([
            u(1, 'A', 1, 'fish', 1, '2026-10-21T15:10:00Z'), u(2, 'B', 2, 'fish', 2, '2026-10-21T15:20:00Z'),
            u(3, 'A', 1, 'wood', 5, '2026-10-21T15:15:00Z'), u(4, 'A', 1, 'fish', 1, '2026-10-21T14:00:00Z')
        ]);
        expect(g.map(x => x.who + ':' + x.buyer_id + ':' + x.items.length)).toEqual(['B:fish:1', 'A:wood:1', 'A:fish:1', 'A:fish:1']);
    });
});
