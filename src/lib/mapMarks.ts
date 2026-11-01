import L from 'leaflet';
import { PX_PER_M, TILE, ZMAX, mapUrl, toPx } from './mapGeo';
import { vectorLayer } from './mapVector';
import { followTheme, mapTheme } from './mapTheme';
import type { GameTheme } from './gameTheme';
import type { MapArea, MapCategory, MapMark } from './mapData';
import { POINTS } from '../data/mapPoints';
import { JOBS } from '../data/jobs';
import { supabase } from './supabase';
import { asset } from './app';

/* спільне для повної мапи (/mapa) і мапи-прев'ю на головній */

export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/* роботи й скупники — вбудовані категорії з даних сайту, решта — з бази (додає адмін) */
export const BUILTIN: MapCategory[] = [
  { id: 'names', name: 'Назви місць', grp: 'Шари мапи', icon: '/icons/map/layer-names.svg', color: '#f4f1ec', sort: 1, shown: true, builtin: true },
  { id: 'zones', name: 'Зелені зони', grp: 'Шари мапи', icon: '/icons/map/layer-zones.svg', color: '#2ea057', sort: 2, shown: true, builtin: true },
  /* дорога навколо всього штату (src/data/ringRoad.json, scripts/ring-road.py) — іншим кольором поверх доріг мапи */
  { id: 'ring', name: 'Кільцева траса', grp: 'Шари мапи', icon: '/icons/map/layer-ring.svg', color: '#ffd24a', sort: 3, shown: true, builtin: true },
  { id: 'jobs', name: 'Роботи', grp: 'Заробіток', icon: '/icons/map/jobs.svg', color: '#ff6a1f', sort: 52, shown: true, builtin: true },
  { id: 'buyers', name: 'Скупники', grp: 'Заробіток', icon: '/icons/harvest/buyer.svg', color: '#f5b301', sort: 53, shown: true, builtin: true }
];
export const BUILTIN_MARKS: MapMark[] = POINTS.map(p => {
  const j = p.kind === 'job' ? JOBS.find(x => x.id === p.job) : undefined;
  return p.kind === 'job'
    ? { id: p.id, category: 'jobs', name: p.name, note: j ? (j.legal ? 'Легальна' : 'Нелегальна') + ' · з ' + j.level + ' рівня' : '', x: p.x, y: p.y, icon: `/icons/jobs/${p.job}.svg`, link: { href: `/wiki/roboty?job=${p.job}`, label: 'Опис роботи →' } }
    : { id: p.id, category: 'buyers', name: p.name, note: p.note || '', x: p.x, y: p.y, icon: p.id === 'buyer-junk' ? '/icons/junk/buyer.svg' : '/icons/harvest/buyer.svg', link: { href: '/tsiny', label: 'Ціни скупників →' } };
});

export type MapData = { cats: MapCategory[]; marks: MapMark[]; areas: MapArea[] | null; owners: Record<number, string> | null };

/* категорії, мітки, зони й власники з бази. null — таблиць мапи ще немає (або бази немає зовсім) */
export async function loadMapData(): Promise<MapData | null> {
  if (!supabase) return null;
  /* '*' — нові колонки (icon, show_label) додає новіший SQL; без них мітки все одно завантажуються */
  /* Supabase віддає максимум 1000 рядків за запит — беремо частинами, поки не прийде неповна сторінка */
  const pts = async () => {
    const all: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const r = await supabase!.from('map_points').select('*').order('id').range(from, from + 999);
      if (r.error) return { data: null, error: r.error };
      all.push(...(r.data || [])); if (!r.data || r.data.length < 1000) return { data: all, error: null };
    }
  };
  const [c, p, o, a] = await Promise.all([supabase.from('map_categories').select('*').order('sort'), pts(), supabase.from('map_owners').select('static_id,game_name'), supabase.from('map_areas').select('*').order('id')]);
  if (c.error || p.error) return null;
  return {
    cats: [...BUILTIN, ...(c.data as MapCategory[])],
    marks: [...BUILTIN_MARKS, ...((p.data || []) as Record<string, unknown>[]).map(r => ({ id: 'db-' + r.id, dbId: r.id as number, category: r.category_id as string, name: r.name as string, note: r.note as string, x: r.x as number, y: r.y as number, owner: r.owner_static as number | null, source: (r.source as string) || null, icon: (r.icon as string | null) || undefined, label: r.show_label !== false }))],
    /* таблиці зон ще може не бути (міграція 0021) — тоді мапа просто без зон */
    areas: a.error ? null : ((a.data || []) as Record<string, unknown>[]).map(r => ({ id: 'area-' + r.id, dbId: r.id as number, category: r.category_id as string, name: (r.name as string) || '', note: (r.note as string) || '', ring: r.ring as [number, number][] })),
    owners: o.error ? null : Object.fromEntries((o.data || []).filter(r => r.game_name).map(r => [r.static_id as number, r.game_name as string]))
  };
}

/* основа мапи: растр до z6, ближче — векторна мапа; без контролів Leaflet (кнопки — свої в HUD) */
/* theme — тема плиток; за замовчуванням тема сайту, у перегляді «Мапи для гри» — її власна (specs/026): тоді retheme()
   після зміни теми перемальовує плитки й вектор */
export function baseMap(el: HTMLElement, opts: L.MapOptions = {}, theme: () => GameTheme = mapTheme) {
  const m = L.map(el, { crs: L.CRS.Simple, minZoom: 1, maxZoom: ZMAX + 2, zoomSnap: 0.5, attributionControl: false, zoomControl: false, ...opts });
  const full = TILE * 2 ** ZMAX;
  const bounds = L.latLngBounds(m.unproject([0, full], ZMAX), m.unproject([full, 0], ZMAX));
  m.setMaxBounds(bounds.pad(0.05));
  /* світлі плитки (specs/019, scripts/map-light-tiles.cjs) вантажаться лише в світлій темі */
  const url = () => mapUrl(theme() === 'light' ? '/map/light/{z}/{x}/{y}.webp' : '/map/{z}/{x}/{y}.webp');
  const tiles = L.tileLayer(url(), { maxNativeZoom: ZMAX, maxZoom: ZMAX + 2, tileSize: TILE, noWrap: true, bounds,
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' });
  followTheme(tiles, () => tiles.setUrl(url(), true)).addTo(m);
  const vec = vectorLayer(ZMAX, PX_PER_M, ZMAX + 2, bounds, theme).addTo(m);
  const ll = (x: number, y: number) => m.unproject(toPx(x, y), ZMAX);
  return { m, bounds, ll, retheme: () => { tiles.setUrl(url()); vec.redraw(); } };
}

/* значок мітки: напівпрозорий розмитий кружок з обводкою кольору категорії (.mpin) */
export function pinIcon(c: MapCategory, icon?: string) {
  return L.divIcon({ className: 'mpin-wrap', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18],
    html: `<span class="mpin" style="border-color:${c.color};box-shadow:0 0 0 3px ${c.color}38,0 6px 14px rgba(0,0,0,.5)"><img src="${esc(asset(icon || c.icon))}" alt="" width="24" height="24"></span>` });
}
