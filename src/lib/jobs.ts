import type { Job } from '../data/jobs';
/* фільтр і сортування робіт, як на сторінці QuantFun: за назвою, прибутковістю або доступністю (рівнем) */
export type JobKind = 'all' | 'legal' | 'illegal';
export type JobSort = 'name' | 'profit' | 'level';

export function filterJobs(list: Job[], kind: JobKind, q: string, sort: JobSort): Job[] {
  const ql = q.trim().toLowerCase();
  const r = list.filter(j => (kind === 'all' || (kind === 'legal') === j.legal) && (!ql || j.name.toLowerCase().includes(ql)));
  const byName = (a: Job, b: Job) => a.name.localeCompare(b.name, 'uk');
  return r.sort((a, b) => sort === 'profit' ? b.profit - a.profit || byName(a, b)
    : sort === 'level' ? a.level - b.level || byName(a, b) : byName(a, b));
}
