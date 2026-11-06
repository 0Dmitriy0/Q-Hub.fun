/* Панель модераторів і редакторів (specs/061): чиста логіка — підрахунок черги, наступна пропозиція,
   «мої рішення», чернетки, людські помилки. Права перевіряє база; тут лише показ */
import type { Section } from './wiki';

export type TaskKind = 'edit' | 'new_page' | 'hide_page' | 'stale_point' | 'new_point';
export type QueueFilter = 'all' | TaskKind | 'conflict';
export const FILTERS: QueueFilter[] = ['all', 'edit', 'new_page', 'hide_page', 'stale_point', 'new_point', 'conflict'];

export interface TaskRow { id?: string; section: Section; kind: 'new' | 'edit' | 'hide'; status: string; created_at: string }
export interface QueueSummary { total: number; conflicts: number; oldest_at: string | null; by: Partial<Record<TaskKind, number>> }

export const KIND_LABEL: Record<TaskKind, string> = {
  edit: 'Правки', new_page: 'Нові сторінки', hide_page: 'Прибрати сторінку', stale_point: 'Точка застаріла', new_point: 'Нові мітки',
};
/* одним рядком у списку черги */
export const KIND_ONE: Record<TaskKind, string> = {
  edit: 'правка', new_page: 'нова сторінка', hide_page: 'прибрати сторінку', stale_point: 'точка застаріла', new_point: 'нова мітка',
};

export function taskKind(p: { section: Section; kind: TaskRow['kind'] }): TaskKind {
  if (p.section === 'map_point') return p.kind === 'hide' ? 'stale_point' : 'new_point';
  return p.kind === 'new' ? 'new_page' : p.kind === 'hide' ? 'hide_page' : 'edit';
}

export function matches(filter: QueueFilter, p: TaskRow): boolean {
  if (filter === 'all') return true;
  if (filter === 'conflict') return p.status === 'conflict';
  return taskKind(p) === filter;
}

export function asFilter(s: string | null): QueueFilter {
  return (FILTERS as string[]).includes(s ?? '') ? (s as QueueFilter) : 'all';
}

export function summarize(rows: TaskRow[]): QueueSummary {
  const by: QueueSummary['by'] = {};
  let oldest: string | null = null; let conflicts = 0;
  for (const r of rows) {
    const k = taskKind(r);
    by[k] = (by[k] ?? 0) + 1;
    if (r.status === 'conflict') conflicts++;
    if (oldest === null || r.created_at < oldest) oldest = r.created_at;
  }
  return { total: rows.length, conflicts, oldest_at: oldest, by };
}

/* list — за created_at зростанням; наступна після рішення в тому самому фільтрі, далі — з початку */
export function nextProposal<T extends TaskRow & { id: string }>(list: T[], decidedId: string, filter: QueueFilter): T | null {
  const inF = list.filter(p => matches(filter, p));
  const i = inF.findIndex(p => p.id === decidedId);
  const after = i >= 0 ? inF.slice(i + 1) : [];
  return after[0] ?? inF.find(p => p.id !== decidedId) ?? null;
}

export function age(s: string, now = Date.now()): string {
  const h = Math.floor((now - new Date(s).getTime()) / 3_600_000);
  return h < 1 ? 'щойно' : h < 24 ? `${h} год тому` : `${Math.floor(h / 24)} дн тому`;
}

/* «Мої рішення» */
export type DecisionAction = 'published' | 'published_edited' | 'rejected' | 'reverted' | 'hidden' | 'unhidden';
export interface Decision { at: string; action: DecisionAction; section: Section; target_id: string | null; title: string; reason: string }
export interface DecidedProposal {
  id: string; section: Section; target_id: string | null; kind: TaskRow['kind']; status: string; reason: string;
  decided_at: string | null; version_id: number | null; title?: string | null;
}
export interface MyVersion { id: number; section: Section; target_id: string; kind: string; note: string; created_at: string; title?: string | null }

export const ACTION_LABEL: Record<DecisionAction, string> = {
  published: 'Опубліковано', published_edited: 'Опубліковано з правками', rejected: 'Відхилено',
  reverted: 'Відкат', hidden: 'Прибрано', unhidden: 'Повернуто',
};

export function mergeDecisions(props: DecidedProposal[], versions: MyVersion[], limit = 50): Decision[] {
  const out: Decision[] = [];
  const fromProposal = new Set<number>();
  for (const p of props) {
    if (!p.decided_at) continue;
    const action: DecisionAction | null = p.status === 'accepted' ? (p.kind === 'hide' ? 'hidden' : 'published')
      : p.status === 'accepted_edited' ? 'published_edited' : p.status === 'rejected' ? 'rejected' : null;
    if (!action) continue;
    if (p.version_id != null) fromProposal.add(p.version_id);
    out.push({ at: p.decided_at, action, section: p.section, target_id: p.target_id, title: p.title ?? '', reason: p.status === 'rejected' ? p.reason : '' });
  }
  for (const v of versions) {
    if (fromProposal.has(v.id)) continue;
    const action: DecisionAction | null = v.kind === 'revert' ? 'reverted' : v.kind === 'hide' ? 'hidden' : v.kind === 'unhide' ? 'unhidden' : null;
    if (!action) continue;
    out.push({ at: v.created_at, action, section: v.section, target_id: v.target_id, title: v.title ?? '', reason: v.note });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

export interface DraftSummary { new: number; published: number; rejected: number }
export function draftCounts(rows: { status: string }[]): DraftSummary {
  const c: DraftSummary = { new: 0, published: 0, rejected: 0 };
  for (const r of rows) if (r.status === 'new' || r.status === 'published' || r.status === 'rejected') c[r.status]++;
  return c;
}

/* людська помилка (FR-008): без кодів і сирого тексту бази */
export const NO_RIGHTS = 'У тебе більше немає прав на цю дію. Онови сторінку.';
export const NO_NET = 'Не вдалося зв\'язатися з сайтом. Спробуй ще раз або напиши власнику.';
export function panelError(e: { code?: string; message?: string } | null | undefined, nick?: string | null): string {
  if (!e) return '';
  if (e.code === 'QH012') return `Цю пропозицію вже розібрав ${nick || 'інший модератор'}.`;
  if (e.code === 'QH010' || /row-level|permission|42501/i.test((e.message || '') + (e.code || ''))) return NO_RIGHTS;
  if (e.code && /^QH0\d\d$/.test(e.code) && e.message) return e.message;
  return NO_NET;
}
