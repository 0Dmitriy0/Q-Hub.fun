import { describe, expect, it } from 'vitest';
import { authorName, expiredShots, rpcError, statusLabel, type MapDraft } from './mapDrafts';

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
});
