import { useEffect, useState } from 'react';
import { JOBS, type Job } from '../data/jobs';
import { supabase } from './supabase';

/* роботи з бази (specs/043, 0057): там їх правлять гравці через пропозиції. src/data/jobs.ts — запас: поки база не відповіла,
   без Supabase (npm run dev) чи якщо таблиці ще немає (міграцію не застосовано) — показуємо роботи з коду */
export type WikiMeta = { version: number; hidden: boolean; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string | null };
export type JobRow = Job & Partial<WikiMeta>;

const ARR = ['requirements', 'features', 'location', 'skills', 'progress', 'controls', 'tips'] as const;
export function fromRow(r: Record<string, unknown>): JobRow {
  const j = { ...r } as unknown as JobRow;
  for (const k of ARR) if (!((j[k] as string[] | undefined)?.length)) delete j[k];
  if (!j.description) delete j.description;
  if (!j.pay) delete j.pay;
  return j;
}

/* таблиці довідника вже є (міграцію 0057 застосовано)? Поки ні — кнопок «Запропонувати правку» не показуємо */
let ready: Promise<boolean> | null = null;
export function wikiReady(): Promise<boolean> {
  if (!ready) ready = supabase
    ? Promise.resolve(supabase.from('wiki_settings').select('max_pending').limit(1)).then(({ error }) => !error)
    : Promise.resolve(false);
  return ready;
}

let cache: JobRow[] | null = null;
export async function loadJobs(): Promise<JobRow[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('jobs').select('*').order('name');
  if (error || !data?.length) return null;
  cache = (data as Record<string, unknown>[]).map(fromRow);
  return cache;
}

export function useJobs() {
  const [jobs, setJobs] = useState<JobRow[]>(cache ?? JOBS);
  const [fromDb, setFromDb] = useState(!!cache);
  const reload = () => loadJobs().then(r => { if (r) { setJobs(r); setFromDb(true); } });
  useEffect(() => { reload(); }, []);
  return { jobs, fromDb, reload };
}
