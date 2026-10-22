import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OCEAN, TILE, ZMAX, makeHash, parseHash, toGame, toPx } from '../lib/mapGeo';
import { groupCategories, ownerLabel, type MapCategory, type MapMark } from '../lib/mapData';
import { POINTS } from '../data/mapPoints';
import { JOBS } from '../data/jobs';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import MapAdmin from '../components/MapAdmin';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ON_KEY = 'qhub:map:on';

/* роботи й скупники — вбудовані категорії з даних сайту, решта — з бази (додає адмін) */
const BUILTIN: MapCategory[] = [
  { id: 'jobs', name: 'Роботи', grp: 'Заробіток', icon: '/icons/map/jobs.svg', color: '#ff6a1f', sort: 52, shown: true, builtin: true },
  { id: 'buyers', name: 'Скупники', grp: 'Заробіток', icon: '/icons/harvest/buyer.svg', color: '#f5b301', sort: 53, shown: true, builtin: true }
];
const BUILTIN_MARKS: MapMark[] = POINTS.map(p => {
  const j = p.kind === 'job' ? JOBS.find(x => x.id === p.job) : undefined;
  return p.kind === 'job'
    ? { id: p.id, category: 'jobs', name: p.name, note: j ? (j.legal ? 'Легальна' : 'Нелегальна') + ' · з ' + j.level + ' рівня' : '', x: p.x, y: p.y, icon: `/icons/jobs/${p.job}.svg`, link: { href: `/roboty?job=${p.job}`, label: 'Опис роботи →' } }
    : { id: p.id, category: 'buyers', name: p.name, note: p.note || '', x: p.x, y: p.y, icon: p.id === 'buyer-junk' ? '/icons/junk/buyer.svg' : '/icons/harvest/buyer.svg', link: { href: '/tsiny', label: 'Ціни скупників →' } };
});

function readOn(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(ON_KEY) || '{}'); } catch { return {}; } }
function saveOn(v: Record<string, boolean>) { try { localStorage.setItem(ON_KEY, JSON.stringify(v)); } catch { /* приватний режим */ } }

export default function MapPage() {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<Record<string, L.LayerGroup>>({});
  const markers = useRef<Record<string, L.Marker>>({});
  const pickRef = useRef(false);
  const pickMarker = useRef<L.CircleMarker | null>(null);
  const nav = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [cats, setCats] = useState<MapCategory[]>(BUILTIN);
  const [marks, setMarks] = useState<MapMark[]>(BUILTIN_MARKS);
  const [saved] = useState(readOn);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const [dbMissing, setDbMissing] = useState(false);
  const [owners, setOwners] = useState<Record<number, string>>({});
  /* на телефоні фільтри згорнуті, щоб мапу було видно одразу */
  const [wide] = useState(() => typeof matchMedia === 'function' && matchMedia('(min-width: 861px)').matches);
  /* мапа на весь екран під шапкою сайту; панель фільтрів — поверх мапи, згортається */
  const [panel, setPanel] = useState(wide);
  const [top, setTop] = useState(64);
  useEffect(() => {
    const h = document.querySelector('header.top'); if (!h) return;
    const upd = () => { setTop(Math.round(h.getBoundingClientRect().height)); map.current?.invalidateSize(); };
    upd(); const ro = new ResizeObserver(upd); ro.observe(h);
    document.body.classList.add('map-open');
    return () => { ro.disconnect(); document.body.classList.remove('map-open'); };
  }, []);

  const isOn = (c: MapCategory) => on[c.id] ?? saved[c.id] ?? c.shown;
  const count = useMemo(() => { const n: Record<string, number> = {}; for (const m of marks) n[m.category] = (n[m.category] || 0) + 1; return n; }, [marks]);
  /* гостям порожні категорії не показуємо — лише адміну, щоб він міг їх наповнити */
  const visibleCats = useMemo(() => cats.filter(c => c.builtin || isAdmin || count[c.id]), [cats, count, isAdmin]);
  const groups = useMemo(() => groupCategories(visibleCats), [visibleCats]);
  const catById = useMemo(() => Object.fromEntries(cats.map(c => [c.id, c])), [cats]);
  const found = useMemo(() => {
    const ql = q.trim().toLowerCase(); if (!ql) return [];
    return marks.filter(m => (m.name + ' ' + (catById[m.category]?.name || '')).toLowerCase().includes(ql)).slice(0, 10);
  }, [q, marks, catById]);

  useEffect(() => {
    if (!supabase) return;
    Promise.all([supabase.from('map_categories').select('*').order('sort'), supabase.from('map_points').select('id,category_id,name,note,x,y,owner_static').limit(20000), supabase.from('map_owners').select('static_id,game_name')]).then(([c, p, o]) => {
      if (c.error || p.error) { setDbMissing(true); return; }
      if (!o.error) setOwners(Object.fromEntries((o.data || []).filter(r => r.game_name).map(r => [r.static_id as number, r.game_name as string])));
      setCats([...BUILTIN, ...(c.data as MapCategory[])]);
      setMarks([...BUILTIN_MARKS, ...(p.data || []).map(r => ({ id: 'db-' + r.id, dbId: r.id as number, category: r.category_id as string, name: r.name as string, note: r.note as string, x: r.x as number, y: r.y as number, owner: r.owner_static as number | null }))]);
    });
  }, []);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const m = L.map(el, { crs: L.CRS.Simple, minZoom: 1, maxZoom: ZMAX + 2, zoomSnap: 0.5, attributionControl: false, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    const full = TILE * 2 ** ZMAX;
    const bounds = L.latLngBounds(m.unproject([0, full], ZMAX), m.unproject([full, 0], ZMAX));
    m.setMaxBounds(bounds.pad(0.05));
    L.tileLayer('/map/{z}/{x}/{y}.webp', { maxNativeZoom: ZMAX, maxZoom: ZMAX + 2, tileSize: TILE, noWrap: true, bounds,
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' }).addTo(m);
    const ll = (x: number, y: number) => m.unproject(toPx(x, y), ZMAX);
    const h = parseHash(location.hash);
    if (h) m.setView(ll(h.x, h.y), h.z); else m.setView(ll(0, -800), 3);
    const game = (e: L.LeafletMouseEvent) => { const pt = m.project(e.latlng, ZMAX); return toGame(pt.x, pt.y); };
    m.on('mousemove', e => setPos(game(e))); m.on('mouseout', () => setPos(null));
    m.on('click', e => {
      if (!pickRef.current) return;
      const g = game(e); setPicked(g);
      pickMarker.current?.remove();
      pickMarker.current = L.circleMarker(e.latlng, { radius: 9, color: '#fff', weight: 3, fillColor: '#ff6a1f', fillOpacity: 1 }).addTo(m);
      pickRef.current = false; setPicking(false);
      if (!wide) setPanel(true);   // на телефоні панель ховалась, щоб клікнути по мапі
    });
    m.on('moveend', () => { const c = m.project(m.getCenter(), ZMAX); const [x, y] = toGame(c.x, c.y); history.replaceState(null, '', makeHash(x, y, Math.round(m.getZoom()))); });
    map.current = m;
    return () => { m.remove(); map.current = null; layers.current = {}; markers.current = {}; };
  }, []);

  /* мітки перебудовуються, коли змінюються дані; видимість — окремо, без перебудови */
  useEffect(() => {
    const m = map.current; if (!m) return;
    for (const g of Object.values(layers.current)) g.remove();
    layers.current = {}; markers.current = {};
    for (const c of cats) layers.current[c.id] = L.layerGroup();
    for (const mk of marks) {
      const c = catById[mk.category]; if (!c) continue;
      const icon = L.divIcon({ className: 'mpin-wrap', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18],
        html: `<span class="mpin" style="border-color:${c.color};box-shadow:0 0 0 3px ${c.color}38,0 6px 14px rgba(0,0,0,.5)"><img src="${esc(mk.icon || c.icon)}" alt="" width="24" height="24"></span>` });
      const html = `<div class="mpop"><b>${esc(mk.name || c.name)}</b>${mk.name ? `<span>${esc(c.name)}</span>` : ''}${mk.note ? `<span>${esc(mk.note)}</span>` : ''}`
        + (mk.owner ? `<span class="mowner">Власник: <b>${esc(ownerLabel(mk.owner, owners))}</b></span>` : '')
        + `<span class="mono mxy">X ${Math.round(mk.x)} · Y ${Math.round(mk.y)}</span>`
        + (mk.link ? `<a data-nav href="${mk.link.href}">${mk.link.label}</a>` : '')
        + (isAdmin && mk.dbId ? `<span class="mrow"><button type="button" class="medit" data-owner="${mk.dbId}">Власник</button><button type="button" class="mdel" data-del="${mk.dbId}">Видалити</button></span>` : '') + '</div>';
      markers.current[mk.id] = L.marker(m.unproject(toPx(mk.x, mk.y), ZMAX), { icon, title: mk.name || c.name, keyboard: true }).bindPopup(html).addTo(layers.current[c.id]);
    }
    for (const c of cats) if (isOn(c)) layers.current[c.id].addTo(m);
  }, [cats, marks, isAdmin, owners]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current; if (!m) return;
    for (const c of cats) { const g = layers.current[c.id]; if (!g) continue; if (isOn(c)) g.addTo(m); else g.remove(); }
  }, [on]);   // eslint-disable-line react-hooks/exhaustive-deps

  function setMany(ids: string[], v: boolean) { setOn(o => { const n = { ...saved, ...o }; for (const id of ids) n[id] = v; saveOn(n); return n; }); }
  function pick(v: boolean) { pickRef.current = v; setPicking(v); if (v) { box.current?.focus(); if (!wide) setPanel(false); } }
  function go(mk: MapMark) {
    const m = map.current; if (!m) return;
    const c = catById[mk.category]; if (c && !isOn(c)) setMany([c.id], true);
    m.flyTo(m.unproject(toPx(mk.x, mk.y), ZMAX), 5, { duration: 0.8 });
    if (!wide) setPanel(false);
    setTimeout(() => markers.current[mk.id]?.openPopup(), 850);
    setQ('');
  }
  async function del(id: number) {
    if (!confirm('Видалити цю мітку з мапи?')) return;
    const { error } = await supabase!.from('map_points').delete().eq('id', id);
    if (error) { alert('Не вдалося видалити: ' + error.message); return; }
    map.current?.closePopup(); setMarks(ms => ms.filter(x => x.dbId !== id));
  }
  async function setOwner(id: number) {
    const cur = marks.find(x => x.dbId === id)?.owner;
    const v = prompt('Статік власника бізнесу (порожньо — прибрати власника):', cur ? String(cur) : '');
    if (v === null) return;
    const st = v.trim() ? Number(v.trim().replace('#', '')) : null;
    if (st !== null && !(Number.isInteger(st) && st > 0)) { alert('Статік — ціле число, напр. 12345.'); return; }
    const { error } = await supabase!.from('map_points').update({ owner_static: st }).eq('id', id);
    if (error) { alert('Не вдалося зберегти: ' + error.message); return; }
    map.current?.closePopup(); setMarks(ms => ms.map(x => (x.dbId === id ? { ...x, owner: st } : x)));
    const o = await supabase!.from('map_owners').select('static_id,game_name');
    if (!o.error) setOwners(Object.fromEntries((o.data || []).filter(r => r.game_name).map(r => [r.static_id as number, r.game_name as string])));
  }
  async function delCat(c: MapCategory) {
    if (!confirm(`Видалити категорію «${c.name}» разом з усіма її мітками (${count[c.id] || 0})?`)) return;
    const { error } = await supabase!.from('map_categories').delete().eq('id', c.id);
    if (error) { alert('Не вдалося видалити: ' + error.message); return; }
    setCats(cs => cs.filter(x => x.id !== c.id)); setMarks(ms => ms.filter(x => x.category !== c.id));
  }

  const allIds = visibleCats.map(c => c.id);
  return (
    <div className="mapfull" style={{ top }}>
      <h1 className="vh">Мапа штату</h1>
      <div className={'mapbox' + (picking ? ' picking' : '')} style={{ background: OCEAN }}
        onClick={e => {
          const t = e.target as HTMLElement;
          const a = t.closest('a[data-nav]'); if (a) { e.preventDefault(); nav(a.getAttribute('href')!); return; }
          const d = t.closest('button[data-del]'); if (d) del(Number(d.getAttribute('data-del')));
          const ow = t.closest('button[data-owner]'); if (ow) setOwner(Number(ow.getAttribute('data-owner')));
        }}>
        <div ref={box} className="mapel" role="region" aria-label="Мапа штату" tabIndex={-1} />
        {picking && <span className="mpick">Клікни на мапі, щоб взяти координати</span>}
        {pos && <span className="mcoord mono">X {Math.round(pos[0])} · Y {Math.round(pos[1])}</span>}
        <span className="mbrand"><img src="/brand/q-hub-logo.svg" alt="" width="22" height="22" />Q-Hub</span>
      </div>
      <button type="button" className="mtoggle btn sm" onClick={() => setPanel(v => !v)} aria-expanded={panel} aria-controls="map-panel">
        <Icon name="map" size={16} />{panel ? 'Сховати панель' : 'Фільтри'}</button>
        <aside id="map-panel" className={'mside' + (panel ? '' : ' hidden')}>
          <div className="fld has-ico msearch"><Icon name="search" /><input type="search" placeholder="Знайти мітку" value={q} onChange={e => setQ(e.target.value)} aria-label="Пошук на мапі" />
            {found.length > 0 && <ul className="mfound">{found.map(mk => <li key={mk.id}><button type="button" onClick={() => go(mk)}><img src={mk.icon || catById[mk.category]?.icon} alt="" width={18} height={18} />{mk.name || catById[mk.category]?.name}<small>{mk.name ? catById[mk.category]?.name : ''}</small></button></li>)}</ul>}
          </div>
          <details className="mfilters" open>
            <summary>Фільтри</summary>
            <div className="mrow"><button type="button" className="btn sm ghost" onClick={() => setMany(allIds, true)}>Показати все</button><button type="button" className="btn sm ghost" onClick={() => setMany(allIds, false)}>Сховати все</button></div>
            {groups.map(({ grp, cats: gc }) => {
              const allOn = gc.every(isOn);
              return (
                <section key={grp} className="mgrp">
                  <button type="button" className="mgrp-h" onClick={() => setMany(gc.map(c => c.id), !allOn)} aria-pressed={allOn} title={allOn ? 'Сховати групу' : 'Показати групу'}>
                    <span>{grp}</span><span className={'meye' + (allOn ? ' on' : '')}>{allOn ? 'видно' : 'сховано'}</span>
                  </button>
                  {gc.map(c => (
                    <label key={c.id} className="mcat">
                      <input type="checkbox" checked={isOn(c)} onChange={e => setMany([c.id], e.target.checked)} />
                      <img src={c.icon} alt="" width={20} height={20} loading="lazy" /><span className="mcat-n">{c.name}</span><span className="cnt">{count[c.id] || 0}</span>
                      {isAdmin && !c.builtin && <button type="button" className="mcat-del" onClick={e => { e.preventDefault(); delCat(c); }} aria-label={'Видалити категорію ' + c.name}>✕</button>}
                    </label>
                  ))}
                </section>
              );
            })}
          </details>
          {isAdmin && (dbMissing
            ? <p className="card err">Таблиць мапи в базі ще немає або вони старої версії. Запусти останній q-hub-map.sql у Supabase → SQL Editor і онови сторінку — тоді тут з'являться інструменти адміна.</p>
            : <MapAdmin cats={cats} picked={picked} picking={picking} onPick={pick}
                onMarks={ms => { setMarks(x => [...x, ...ms]); setMany([...new Set(ms.map(m => m.category))], true); }} onCat={c => { setCats(x => [...x, c]); setMany([c.id], true); }} />)}
        </aside>
    </div>
  );
}
