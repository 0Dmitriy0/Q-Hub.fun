import { useEffect, useState } from 'react';
import { GUIDES, type Guide, type GuideBlock } from '../data/guides';
import type { IconName } from '../components/Icon';
import { supabase } from './supabase';
import type { WikiMeta } from './jobsData';

/* гайди з бази (wiki_guides, 0065): їх пишуть і правлять гравці через пропозиції. src/data/guides.ts — запас: поки база
   не відповіла, без Supabase чи якщо міграцію 0065 ще не застосовано — показуємо гайди з коду (без кнопок пропозицій) */
export type GuideRow = Guide & Partial<WikiMeta>;

const fromRow = (r: Record<string, unknown>): GuideRow => ({
  slug: String(r.id), title: String(r.name), summary: String(r.summary ?? ''), icon: (r.icon as IconName) || 'book',
  blocks: (r.blocks as GuideBlock[]) ?? [], version: Number(r.version ?? 1), hidden: !!r.hidden,
  created_by: (r.created_by as string | null) ?? null, updated_by: (r.updated_by as string | null) ?? null,
  created_at: String(r.created_at ?? ''), updated_at: (r.updated_at as string | null) ?? null,
});
/* гайд як дані пропозиції — ті самі ключі, що в базі (FIELDS.guide) */
export const guideData = (g: GuideRow) => ({ id: g.slug, name: g.title, summary: g.summary, icon: g.icon, blocks: g.blocks });

let cache: GuideRow[] | null = null;
export async function loadGuides(): Promise<GuideRow[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('wiki_guides').select('*').order('sort').order('name');
  if (error || !data?.length) return null;
  cache = (data as Record<string, unknown>[]).map(fromRow);
  return cache;
}

export function useGuides() {
  const [guides, setGuides] = useState<GuideRow[]>(cache ?? GUIDES);
  const [fromDb, setFromDb] = useState(!!cache);
  const reload = () => loadGuides().then(r => { if (r) { setGuides(r); setFromDb(true); } });
  useEffect(() => { reload(); }, []);
  return { guides, fromDb, reload };
}
