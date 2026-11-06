import { describe, expect, it } from 'vitest';
import { asFilter, draftCounts, mergeDecisions, nextProposal, NO_NET, NO_RIGHTS, panelError, summarize, taskKind, type TaskRow } from './panel';

const t = (id: string, section: TaskRow['section'], kind: TaskRow['kind'], created_at: string, status = 'pending') => ({ id, section, kind, status, created_at });

describe('taskKind', () => {
  it('мітки мапи', () => {
    expect(taskKind({ section: 'map_point', kind: 'hide' })).toBe('stale_point');
    expect(taskKind({ section: 'map_point', kind: 'new' })).toBe('new_point');
  });
  it('роботи й транспорт', () => {
    expect(taskKind({ section: 'job', kind: 'edit' })).toBe('edit');
    expect(taskKind({ section: 'vehicle', kind: 'new' })).toBe('new_page');
    expect(taskKind({ section: 'job', kind: 'hide' })).toBe('hide_page');
  });
});

describe('summarize', () => {
  it('порожньо', () => {
    expect(summarize([])).toEqual({ total: 0, conflicts: 0, oldest_at: null, by: {} });
  });
  it('рахує види, конфлікти й найстарішу', () => {
    const s = summarize([
      t('a', 'job', 'edit', '2026-11-05T10:00:00Z'),
      t('b', 'job', 'edit', '2026-11-04T10:00:00Z', 'conflict'),
      t('c', 'map_point', 'hide', '2026-11-06T10:00:00Z'),
    ]);
    expect(s.total).toBe(3);
    expect(s.conflicts).toBe(1);
    expect(s.oldest_at).toBe('2026-11-04T10:00:00Z');
    expect(s.by).toEqual({ edit: 2, stale_point: 1 });
    expect('new_page' in s.by).toBe(false);
  });
});

describe('nextProposal', () => {
  const list = [
    t('1', 'job', 'edit', '2026-11-01'), t('2', 'map_point', 'hide', '2026-11-02'),
    t('3', 'job', 'edit', '2026-11-03', 'conflict'), t('4', 'job', 'edit', '2026-11-04'),
  ];
  it('наступна у фільтрі', () => {
    expect(nextProposal(list, '1', 'edit')?.id).toBe('3');
    expect(nextProposal(list, '1', 'all')?.id).toBe('2');
  });
  it('після останньої — з початку, крім розібраної', () => {
    expect(nextProposal(list, '4', 'edit')?.id).toBe('1');
  });
  it('порожньо — null', () => {
    expect(nextProposal(list, '2', 'stale_point')).toBeNull();
    expect(nextProposal([], 'x', 'all')).toBeNull();
  });
  it('фільтр «конфлікт»', () => {
    expect(nextProposal(list, '1', 'conflict')?.id).toBe('3');
    expect(nextProposal(list, '3', 'conflict')).toBeNull();
  });
});

describe('mergeDecisions', () => {
  it('зливає, не дублює прибирання з пропозиції, сортує й обрізає', () => {
    const r = mergeDecisions([
      { id: 'p1', section: 'job', target_id: 'a', kind: 'edit', status: 'accepted', reason: '', decided_at: '2026-11-03', version_id: 10, title: 'A' },
      { id: 'p2', section: 'job', target_id: 'b', kind: 'edit', status: 'rejected', reason: 'Дубль', decided_at: '2026-11-04', version_id: null },
      { id: 'p3', section: 'map_point', target_id: '5', kind: 'hide', status: 'accepted', reason: '', decided_at: '2026-11-01', version_id: 11 },
      { id: 'p4', section: 'job', target_id: 'c', kind: 'edit', status: 'accepted_edited', reason: '', decided_at: '2026-11-02', version_id: 12 },
    ], [
      { id: 11, section: 'map_point', target_id: '5', kind: 'hide', note: '', created_at: '2026-11-01' },
      { id: 20, section: 'job', target_id: 'a', kind: 'revert', note: 'вандалізм', created_at: '2026-11-05' },
      { id: 21, section: 'job', target_id: 'd', kind: 'unhide', note: 'повернули в гру', created_at: '2026-11-00' },
    ]);
    expect(r.map(d => d.action)).toEqual(['reverted', 'rejected', 'published', 'published_edited', 'hidden', 'unhidden']);
    expect(r.find(d => d.action === 'rejected')?.reason).toBe('Дубль');
    expect(r.filter(d => d.action === 'hidden')).toHaveLength(1);
  });
  it('не більше ліміту', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: 'p' + i, section: 'job' as const, target_id: 'x', kind: 'edit' as const, status: 'accepted', reason: '', decided_at: `2026-11-01T00:${String(i).padStart(2, '0')}:00Z`, version_id: i }));
    expect(mergeDecisions(many, [])).toHaveLength(50);
  });
});

describe('draftCounts', () => {
  it('за станом', () => {
    expect(draftCounts([{ status: 'new' }, { status: 'new' }, { status: 'rejected' }, { status: 'published' }, { status: 'інше' }]))
      .toEqual({ new: 2, published: 1, rejected: 1 });
  });
});

describe('panelError', () => {
  it('вже розібрали', () => {
    expect(panelError({ code: 'QH012', message: 'x' }, 'Petro')).toBe('Цю пропозицію вже розібрав Petro.');
    expect(panelError({ code: 'QH012' })).toBe('Цю пропозицію вже розібрав інший модератор.');
  });
  it('немає прав', () => {
    expect(panelError({ code: 'QH010', message: 'Приймати правки можуть лише модератори.' })).toBe(NO_RIGHTS);
    expect(panelError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(NO_RIGHTS);
  });
  it('інший код бази — текст бази', () => {
    expect(panelError({ code: 'QH011', message: 'Вкажи причину відхилення.' })).toBe('Вкажи причину відхилення.');
  });
  it('решта — без сирого тексту', () => {
    expect(panelError({ message: 'Failed to fetch' })).toBe(NO_NET);
    expect(panelError(null)).toBe('');
  });
});

describe('asFilter', () => {
  it('невідоме — all', () => {
    expect(asFilter('stale_point')).toBe('stale_point');
    expect(asFilter('xxx')).toBe('all');
    expect(asFilter(null)).toBe('all');
  });
});
