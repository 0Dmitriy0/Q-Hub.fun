import { describe, expect, it } from 'vitest';
import { filterJobs } from './jobs';
import { JOBS } from '../data/jobs';

const J = [
  { id: 'a', name: 'Таксі', legal: true, level: 2, profit: 2 },
  { id: 'b', name: 'Акванавт', legal: true, level: 7, profit: 3 },
  { id: 'c', name: 'Автовикрадач', legal: false, level: 5, profit: 3 }
];

describe('роботи', () => {
  it('легальні, нелегальні й пошук', () => {
    expect(filterJobs(J, 'legal', '', 'name').map(j => j.id)).toEqual(['b', 'a']);
    expect(filterJobs(J, 'illegal', '', 'name').map(j => j.id)).toEqual(['c']);
    expect(filterJobs(J, 'all', 'такс', 'name').map(j => j.id)).toEqual(['a']);
  });
  it('сортування: прибуток (рівні — за назвою) і рівень від найдоступнішої', () => {
    expect(filterJobs(J, 'all', '', 'profit').map(j => j.id)).toEqual(['c', 'b', 'a']);
    expect(filterJobs(J, 'all', '', 'level').map(j => j.id)).toEqual(['a', 'c', 'b']);
  });
  it('кожна робота має унікальний id, рівень і прибуток 0–3', () => {
    expect(new Set(JOBS.map(j => j.id)).size).toBe(JOBS.length);
    for (const j of JOBS) { expect(j.level).toBeGreaterThan(0); expect(j.profit).toBeGreaterThanOrEqual(0); expect(j.profit).toBeLessThanOrEqual(3); }
  });
});
