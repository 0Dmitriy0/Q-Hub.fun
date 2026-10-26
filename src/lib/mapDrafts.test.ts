import { describe, expect, it } from 'vitest';
import { authorName, expiredShots, nearby, rpcError, statusLabel, type MapDraft } from './mapDrafts';

const d = (over: Partial<MapDraft>): MapDraft => ({
  id: 'x', author: 'a', taken_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z', shot: 'a/x.jpg',
  x: 1, y: 2, status: 'new', reviewed_at: null, point_id: null, shot_deleted_at: null, ...over,
});

describe('чернетки міток', () => {
  it('статуси українською', () => {
    expect(statusLabel('new')).toBe('Нова');
    expect(statusLabel('published')).toBe('Опубліковано');
    expect(statusLabel('rejected')).toBe('Відхилено');
  });

  it('помилки бази → зрозумілий текст', () => {
    expect(rpcError('already_processed')).toBe('Чернетку вже оброблено.');
    expect(rpcError('no_category')).toBe('Оберіть категорію.');
    expect(rpcError('no_point')).toBe('Поставте точку на мапі.');
    expect(rpcError('not_admin')).toBe('Це може лише адмін.');
    expect(rpcError('permission denied for function publish_map_draft')).toBe('Це може лише адмін.');
    expect(rpcError('щось інше')).toBe('щось інше');
  });

  it('автор: нік у грі, інакше ім\'я, інакше «редактор»', () => {
    expect(authorName({ who: { game_name: 'Dmitriy_Core', name: 'dima' } })).toBe('Dmitriy_Core');
    expect(authorName({ who: { game_name: ' ', name: 'dima' } })).toBe('dima');
    expect(authorName({ who: null })).toBe('редактор');
  });

  it('знімки до видалення: оброблені понад 30 днів тому й ще не видалені', () => {
    const now = new Date('2026-11-30T12:00:00Z');
    const list = [
      d({ id: 'old', status: 'published', reviewed_at: '2026-10-30T11:00:00Z' }),
      d({ id: 'fresh', status: 'rejected', reviewed_at: '2026-10-31T13:00:00Z' }),
      d({ id: 'new', status: 'new', created_at: '2026-01-01T00:00:00Z' }),
      d({ id: 'gone', status: 'rejected', reviewed_at: '2026-09-01T00:00:00Z', shot_deleted_at: '2026-10-02T00:00:00Z' }),
    ];
    expect(expiredShots(list, now).map(x => x.id)).toEqual(['old']);
  });

  it('поруч: мітки тієї ж категорії й інші нові чернетки в радіусі 30 м, ближчі — першими', () => {
    const m = (id: string, category: string, x: number, y: number) => ({ id, category, name: id, note: '', x, y });
    const points = [m('edge', 'bins', 30, 0), m('far', 'bins', 30.1, 0), m('other', 'atm', 1, 0), m('close', 'bins', 0, 10)];
    const drafts = [
      d({ id: 'self', x: 0, y: 0 }),
      d({ id: 'twin', x: 0, y: -5, category_id: 'atm', who: { game_name: 'Vova', name: null } }),
      d({ id: 'done', x: 1, y: 1, status: 'published' }),
      d({ id: 'blind', x: null, y: null }),
      d({ id: 'away', x: 0, y: 30.1 }),
    ];
    const near = nearby([0, 0], 'bins', points, drafts, 'self');
    expect(near.map(n => n.id)).toEqual(['twin', 'close', 'edge']);
    expect(near[0]).toMatchObject({ kind: 'draft', name: 'чернетка від Vova', dist: 5 });
    expect(near[2]).toMatchObject({ kind: 'point', name: 'edge', dist: 30 });
    expect(nearby([0, 0], '', points, drafts, 'self').map(n => n.id)).toEqual(['twin']);   // категорію ще не обрано — лише чернетки
  });
});
