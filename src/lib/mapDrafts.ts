/* Чернетки міток з гри (specs/001-map-pin-drafts): редактор тисне F9 у програмі — сюди приходить знімок і точка.
   Публікує в мапу чи відхиляє лише адмін — функціями бази publish_map_draft / reject_map_draft (міграція 0019). */
import { supabase } from './supabase';
import type { MapMark } from './mapData';

export type DraftStatus = 'new' | 'published' | 'rejected';
export interface MapDraft {
  id: string; author: string; taken_at: string; created_at: string; shot: string;
  x: number | null; y: number | null; status: DraftStatus;
  reviewed_at: string | null; point_id: number | null; shot_deleted_at: string | null;
  category_id?: string | null; note?: string;   // підказка редактора з програми (0020), коли точку не знайдено
  who?: { game_name: string | null; name: string | null } | null;
}

export const statusLabel = (s: DraftStatus) => ({ new: 'Нова', published: 'Опубліковано', rejected: 'Відхилено' }[s]);

/* помилки функцій бази → зрозумілий текст */
export function rpcError(message: string): string {
  if (/already_processed/.test(message)) return 'Чернетку вже оброблено.';
  if (/no_category/.test(message)) return 'Оберіть категорію.';
  if (/no_point/.test(message)) return 'Поставте точку на мапі.';
  if (/not_admin|permission denied/.test(message)) return 'Це може лише адмін.';
  if (/map_drafts_x_check|map_drafts_y_check|check constraint/.test(message)) return 'Точка поза мапою.';
  return message;
}

/* хто подав: нік у грі, інакше ім'я з Discord */
export const authorName = (d: Pick<MapDraft, 'who'>) => d.who?.game_name?.trim() || d.who?.name?.trim() || 'редактор';

/* знімки, які пора видалити: чернетку оброблено понад 30 днів тому, а знімок ще лежить */
export const SHOT_DAYS = 30;
export function expiredShots(drafts: MapDraft[], now: Date): MapDraft[] {
  const edge = now.getTime() - SHOT_DAYS * 864e5;
  return drafts.filter(d => d.status !== 'new' && d.reviewed_at && new Date(d.reviewed_at).getTime() < edge && !d.shot_deleted_at);
}

/* щоб не плодити дублікатів (FR-017): опубліковані мітки тієї ж категорії й інші нові чернетки в радіусі r метрів гри.
   Категорію ще не обрано — лише чернетки. Ближчі — першими */
export interface Near { kind: 'point' | 'draft'; id: string; name: string; x: number; y: number; dist: number }
export function nearby(p: [number, number], category: string, points: Pick<MapMark, 'id' | 'category' | 'name' | 'x' | 'y'>[],
  drafts: MapDraft[], selfId: string, r = 30): Near[] {
  const dist = (x: number, y: number) => Math.hypot(x - p[0], y - p[1]);
  const out: Near[] = [];
  if (category) for (const m of points) if (m.category === category && dist(m.x, m.y) <= r) out.push({ kind: 'point', id: m.id, name: m.name, x: m.x, y: m.y, dist: dist(m.x, m.y) });
  for (const d of drafts) {
    if (d.id === selfId || d.status !== 'new' || d.x === null || d.y === null || dist(d.x, d.y) > r) continue;
    out.push({ kind: 'draft', id: d.id, name: 'чернетка від ' + authorName(d), x: d.x, y: d.y, dist: dist(d.x, d.y) });
  }
  return out.sort((a, b) => a.dist - b.dist);
}

const BUCKET = 'map-drafts';

export async function loadDrafts(): Promise<{ data: MapDraft[]; error: string | null }> {
  const cols = 'id,author,taken_at,created_at,shot,x,y,status,reviewed_at,point_id,shot_deleted_at,who:profiles!author(game_name,name)';
  const q = (c: string) => supabase!.from('map_drafts').select(c).order('created_at', { ascending: false }).limit(500);
  let { data, error } = await q(cols + ',category_id,note');
  if (error && /category_id|note/.test(error.message)) ({ data, error } = await q(cols));   // міграцію 0020 ще не застосовано
  if (error) return { data: [], error: /relation .*map_drafts|schema cache/i.test(error.message) ? 'У базі ще немає таблиці чернеток — запусти міграцію 0019_map_drafts.sql у Supabase → SQL Editor.' : error.message };
  return { data: (data || []) as unknown as MapDraft[], error: null };
}

/* знімок закритий — посилання діє 10 хвилин */
export async function shotUrl(path: string): Promise<string | null> {
  const { data } = await supabase!.storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl || null;
}

/* мініатюри списку — одним запитом */
export async function shotUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase!.storage.from(BUCKET).createSignedUrls(paths, 600);
  const out: Record<string, string> = {};
  for (const r of data || []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

export async function publishDraft(id: string, p: { category: string; x: number; y: number; name: string; note: string }): Promise<{ pointId?: number; error?: string }> {
  const { data, error } = await supabase!.rpc('publish_map_draft', { draft: id, category: p.category, x: p.x, y: p.y, name: p.name, note: p.note });
  return error ? { error: rpcError(error.message) } : { pointId: data as number };
}

export async function rejectDraft(id: string): Promise<string | null> {
  const { error } = await supabase!.rpc('reject_map_draft', { draft: id });
  return error ? rpcError(error.message) : null;
}

/* адмін відкрив чернетки — прибрати старі знімки (сховище) і позначити це в базі; помилка не заважає роботі */
export async function purgeExpiredShots(drafts: MapDraft[]): Promise<string[]> {
  const old = expiredShots(drafts, new Date());
  if (!old.length) return [];
  const { error } = await supabase!.storage.from(BUCKET).remove(old.map(d => d.shot));
  if (error) return [];
  const ids = old.map(d => d.id);
  await supabase!.rpc('mark_map_draft_shots_deleted', { drafts: ids });
  return ids;
}
