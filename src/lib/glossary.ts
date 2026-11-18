/* Глосарій RP-термінів (specs/093): живі дані — таблиця glossary_terms (правлять admin і moderator, 0080),
   вбудована копія — src/data/glossary.json (без мережі, сайт без бази). Програма й сайт тримають кеш у localStorage
   на 10 хвилин — як мітки мапи в плашці; без мережі — останній кеш, без кешу — вбудований JSON. */
import { supabase } from './supabase';
import BUILTIN from '../data/glossary.json';
import type { GlossaryTerm } from '../desktop/rulesSearch';

export const GLOSSARY_TTL = 10 * 60e3;
const KEY = 'qhub.glossary';
const COLS = 'term,aliases,full_name,description,related_rules';
export const builtinGlossary = (): GlossaryTerm[] => (BUILTIN as { terms: GlossaryTerm[] }).terms;

type Cache = { at: number; terms: GlossaryTerm[] };
function readCache(): Cache | null {
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && Array.isArray(c.terms) ? c : null; } catch { return null; }
}
function writeCache(terms: GlossaryTerm[], now: number) {
  try { localStorage.setItem(KEY, JSON.stringify({ at: now, terms })); } catch { /* приватне вікно — без кешу */ }
}
const clean = (rows: Record<string, unknown>[]): GlossaryTerm[] => rows.map(r => ({
  term: String(r.term ?? ''), aliases: (r.aliases as string[] | null) ?? [], full_name: String(r.full_name ?? ''),
  description: String(r.description ?? ''), related_rules: (r.related_rules as string[] | null) ?? [],
})).filter(t => t.term && t.description);

/* для пошуку й сторінки: база (не частіше ніж раз на 10 хв) → кеш → вбудований. fetchRows — для тестів */
export async function loadGlossary(opts: { now?: number; fetchRows?: () => Promise<Record<string, unknown>[] | null> } = {}): Promise<GlossaryTerm[]> {
  const now = opts.now ?? Date.now();
  const cache = readCache();
  if (cache && now - cache.at < GLOSSARY_TTL) return cache.terms;
  const fetchRows = opts.fetchRows ?? (async () => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('glossary_terms').select(COLS).order('term');
    return error ? null : (data as Record<string, unknown>[]);
  });
  try {
    const rows = await fetchRows();
    if (rows) { const terms = clean(rows); writeCache(terms, now); return terms; }
  } catch { /* без мережі — нижче */ }
  /* хоч раз отримали з бази — прибрані терміни не повертаються з вбудованої копії */
  return cache?.terms ?? builtinGlossary();
}

/* ---------- для команди (admin, moderator): керування з версіями (RPC 0080) ---------- */
export interface AdminTerm extends GlossaryTerm { id: string; hidden: boolean; version: number; updated_at: string }
export interface TermVersion { version_no: number; action: 'create' | 'edit' | 'hide' | 'unhide' | 'revert'; data: GlossaryTerm & { hidden: boolean }; author: string | null; created_at: string }

const db = () => { if (!supabase) throw new Error('Немає з\'єднання з базою.'); return supabase; };
const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export async function loadGlossaryAdmin(): Promise<AdminTerm[]> {
  const { data, error } = await db().from('glossary_terms').select(`id,${COLS},hidden,version,updated_at`).order('term');
  fail(error);
  return (data ?? []) as AdminTerm[];
}
export async function saveTerm(id: string | null, t: GlossaryTerm): Promise<string> {
  const { data, error } = await db().rpc('glossary_save', {
    p_id: id, p_term: t.term, p_aliases: t.aliases, p_full_name: t.full_name, p_description: t.description, p_related: t.related_rules,
  });
  fail(error);
  return data as string;
}
export async function hideTerm(id: string) { fail((await db().rpc('glossary_hide', { p_id: id })).error); }
export async function unhideTerm(id: string) { fail((await db().rpc('glossary_unhide', { p_id: id })).error); }
export async function revertTerm(id: string, version: number) { fail((await db().rpc('glossary_revert', { p_id: id, p_version: version })).error); }
export async function termHistory(id: string): Promise<(TermVersion & { author_nick: string | null })[]> {
  const { data, error } = await db().from('glossary_versions').select('version_no,action,data,author,created_at').eq('term_id', id).order('version_no', { ascending: false });
  fail(error);
  const rows = (data ?? []) as TermVersion[];
  const ids = [...new Set(rows.map(r => r.author).filter(Boolean))] as string[];
  const nicks = new Map<string, string | null>();
  if (ids.length) {
    const { data: ps } = await db().from('profiles').select('id,nick').in('id', ids);
    for (const p of (ps ?? []) as { id: string; nick: string | null }[]) nicks.set(p.id, p.nick);
  }
  return rows.map(r => ({ ...r, author_nick: r.author ? nicks.get(r.author) ?? null : null }));
}
/* скинути кеш після зміни командою — сайт одразу бачить нове */
export function dropGlossaryCache() { try { localStorage.removeItem(KEY); } catch { /* немає сховища */ } }
