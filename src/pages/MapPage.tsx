import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OCEAN, PX_PER_M, TILE, ZMAX, makeHash, mapUrl, parseHash, toGame, toPx } from '../lib/mapGeo';
import { namesLayer, vectorLayer } from '../lib/mapVector';
import { groupCategories, ownerLabel, type MapCategory, type MapMark } from '../lib/mapData';
import { POINTS } from '../data/mapPoints';
import LABELS from '../data/mapLabels.json';
import ZONES from '../data/mapZones.json';
import { JOBS } from '../data/jobs';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import MapAdmin, { MarkEdit } from '../components/MapAdmin';
import GameMapExport from '../components/GameMapExport';
import MapDrafts from '../components/MapDrafts';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ON_KEY = 'qhub:map:on';

/* роботи й скупники — вбудовані категорії з даних сайту, решта — з бази (додає адмін) */
const BUILTIN: MapCategory[] = [
  { id: 'names', name: 'Назви місць', grp: 'Шари мапи', icon: '/icons/map/layer-names.svg', color: '#f4f1ec', sort: 1, shown: true, builtin: true },
  { id: 'zones', name: 'Зелені зони', grp: 'Шари мапи', icon: '/icons/map/layer-zones.svg', color: '#2ea057', sort: 2, shown: true, builtin: true },
  { id: 'jobs', name: 'Роботи', grp: 'Заробіток', icon: '/icons/map/jobs.svg', color: '#ff6a1f', sort: 52, shown: true, builtin: true },
  { id: 'buyers', name: 'Скупники', grp: 'Заробіток', icon: '/icons/harvest/buyer.svg', color: '#f5b301', sort: 53, shown: true, builtin: true }
];
const BUILTIN_MARKS: MapMark[] = POINTS.map(p => {
  const j = p.kind === 'job' ? JOBS.find(x => x.id === p.job) : undefined;
  return p.kind === 'job'
    ? { id: p.id, category: 'jobs', name: p.name, note: j ? (j.legal ? 'Легальна' : 'Нелегальна') + ' · з ' + j.level + ' рівня' : '', x: p.x, y: p.y, icon: `/icons/jobs/${p.job}.svg`, link: { href: `/roboty?job=${p.job}`, label: 'Опис роботи →' } }
    : { id: p.id, category: 'buyers', name: p.name, note: p.note || '', x: p.x, y: p.y, icon: p.id === 'buyer-junk' ? '/icons/junk/buyer.svg' : '/icons/harvest/buyer.svg', link: { href: '/tsiny', label: 'Ціни скупників →' } };
});

/* при першому відкритті мапи увімкнені лише ці групи; далі — як гравець сам налаштував */
const DEFAULT_GROUPS = new Set(['Магазини', 'Структури', 'Транспорт', 'Розваги']);
const OPEN_KEY = 'qhub:map:open';
function readOpen(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}'); } catch { return {}; } }
function readOn(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(ON_KEY) || '{}'); } catch { return {}; } }
function saveOn(v: Record<string, boolean>) { try { localStorage.setItem(ON_KEY, JSON.stringify(v)); } catch { /* приватний режим */ } }

/* з якого зуму під мітками видно їхні назви */
const LABEL_ZOOM = 5;

export default function MapPage() {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<Record<string, L.LayerGroup>>({});
  const markers = useRef<Record<string, L.Marker>>({});
  const pickRef = useRef(false);
  const pickMarker = useRef<L.CircleMarker | null>(null);
  const nav = useNavigate();
  const { role, isStaff } = useAuth();
  const isAdmin = role === 'admin';
  /* точка відкритої чернетки: маркер на мапі (адмін його перетягує); клік у режимі «поставити» ставить її сюди */
  const [draftPt, setDraftPt] = useState<[number, number] | null>(null);
  const draftMarker = useRef<L.Marker | null>(null);
  const pickFor = useRef<'mark' | 'draft'>('mark');
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
  const [editing, setEditing] = useState<MapMark | null>(null);
  /* комп'ютер: мапа на весь екран під шапкою, панель фільтрів поверх мапи і згортається.
     телефон: звичайна сторінка — мапа зверху, фільтри під нею */
  const mq = typeof matchMedia === 'function' ? matchMedia('(min-width: 861px)') : null;
  const [wide, setWide] = useState(() => !!mq?.matches);
  const [panel, setPanel] = useState(true);
  const [top, setTop] = useState(64);
  useEffect(() => {
    if (!mq) return;
    const f = () => setWide(mq.matches); mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    map.current?.invalidateSize();
    if (!wide) return;
    const h = document.querySelector('header.top'); if (!h) return;
    const upd = () => { setTop(Math.round(h.getBoundingClientRect().height)); map.current?.invalidateSize(); };
    upd(); const ro = new ResizeObserver(upd); ro.observe(h);
    document.body.classList.add('map-open');
    return () => { ro.disconnect(); document.body.classList.remove('map-open'); };
  }, [wide]);

  const isOn = (c: MapCategory) => on[c.id] ?? saved[c.id] ?? DEFAULT_GROUPS.has(c.grp);
  /* панель: вкладки й згорнуті групи */
  const [tab, setTab] = useState<'filters' | 'game' | 'admin' | 'drafts'>('filters');
  const [openG, setOpenG] = useState<Record<string, boolean>>(readOpen);
  const toggleG = (g: string) => setOpenG(o => { const n = { ...o, [g]: !o[g] }; try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)); } catch { /* приватний режим */ } return n; });
  const count = useMemo(() => { const n: Record<string, number> = { names: LABELS.length, zones: ZONES.length }; for (const m of marks) n[m.category] = (n[m.category] || 0) + 1; return n; }, [marks]);
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
    Promise.all([supabase.from('map_categories').select('*').order('sort'), pts(), supabase.from('map_owners').select('static_id,game_name')]).then(([c, p, o]) => {
      if (c.error || p.error) { setDbMissing(true); return; }
      if (!o.error) setOwners(Object.fromEntries((o.data || []).filter(r => r.game_name).map(r => [r.static_id as number, r.game_name as string])));
      setCats([...BUILTIN, ...(c.data as MapCategory[])]);
      setMarks([...BUILTIN_MARKS, ...((p.data || []) as Record<string, unknown>[]).map(r => ({ id: 'db-' + r.id, dbId: r.id as number, category: r.category_id as string, name: r.name as string, note: r.note as string, x: r.x as number, y: r.y as number, owner: r.owner_static as number | null, icon: (r.icon as string | null) || undefined, label: r.show_label !== false }))]);
    });
  }, []);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const m = L.map(el, { crs: L.CRS.Simple, minZoom: 1, maxZoom: ZMAX + 2, zoomSnap: 0.5, attributionControl: false, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    const full = TILE * 2 ** ZMAX;
    const bounds = L.latLngBounds(m.unproject([0, full], ZMAX), m.unproject([full, 0], ZMAX));
    m.setMaxBounds(bounds.pad(0.05));
    L.tileLayer(mapUrl('/map/{z}/{x}/{y}.webp'), { maxNativeZoom: ZMAX, maxZoom: ZMAX + 2, tileSize: TILE, noWrap: true, bounds,
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' }).addTo(m);
    /* ближче за z6 растр лише розтягувався б — поверх нього малюємо векторну мапу */
    vectorLayer(ZMAX, PX_PER_M, ZMAX + 2, bounds).addTo(m);
    const np = m.createPane('names'); np.style.zIndex = '450'; np.style.pointerEvents = 'none';   // назви над зеленими зонами (overlayPane 400), під мітками (600)
    const ll = (x: number, y: number) => m.unproject(toPx(x, y), ZMAX);
    const h = parseHash(location.hash);
    if (h) m.setView(ll(h.x, h.y), h.z); else m.setView(ll(0, -800), 3);
    const game = (e: L.LeafletMouseEvent) => { const pt = m.project(e.latlng, ZMAX); return toGame(pt.x, pt.y); };
    m.on('mousemove', e => setPos(game(e))); m.on('mouseout', () => setPos(null));
    m.on('click', e => {
      if (!pickRef.current) return;
      const g = game(e);
      if (pickFor.current === 'draft') { setDraftPt(g); pickRef.current = false; setPicking(false); return; }
      setPicked(g);
      pickMarker.current?.remove();
      pickMarker.current = L.circleMarker(e.latlng, { radius: 9, color: '#fff', weight: 3, fillColor: '#ff6a1f', fillOpacity: 1 }).addTo(m);
      pickRef.current = false; setPicking(false);
    });
    const labels = () => {
      el.classList.toggle('mlabels-on', m.getZoom() >= LABEL_ZOOM);
    };
    m.on('zoomend', labels); labels();
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
        + (isAdmin && mk.dbId ? `<span class="mrow"><button type="button" class="medit" data-edit="${mk.dbId}">Змінити</button><button type="button" class="medit" data-owner="${mk.dbId}">Власник</button><button type="button" class="mdel" data-del="${mk.dbId}">Видалити</button></span>` : '') + '</div>';
      markers.current[mk.id] = L.marker(m.unproject(toPx(mk.x, mk.y), ZMAX), { icon, title: mk.name || c.name, keyboard: true }).bindPopup(html).addTo(layers.current[c.id]);
      /* назва під міткою; на дальньому зумі ховається (див. .mlabels-on), щоб не було каші */
      if (mk.name && mk.label !== false) markers.current[mk.id].bindTooltip(esc(mk.name), { permanent: true, direction: 'bottom', offset: [0, 16], className: 'mlabel' });
    }
    /* шари мапи: зелені зони й назви місць (дані з експорту Hydra, scripts/minimap) */
    const ll = (x: number, y: number) => m.unproject(toPx(x, y), ZMAX);
    if (layers.current.zones) for (const z of ZONES as number[][][][]) L.polygon(z.map(r => r.map(([x, y]) => ll(x, y))), { color: '#9ff0b8', weight: 1.5, dashArray: '6 5', fillColor: '#2ea057', fillOpacity: 0.26, interactive: false }).addTo(layers.current.zones);
    /* назви — трикутники тексту Hydra частиною мапи, як у грі (namesLayer) */
    if (layers.current.names) { const full = TILE * 2 ** ZMAX; namesLayer(ZMAX, PX_PER_M, ZMAX + 2, L.latLngBounds(m.unproject([0, full], ZMAX), m.unproject([full, 0], ZMAX))).addTo(layers.current.names); }
    for (const c of cats) if (isOn(c)) layers.current[c.id].addTo(m);
    m.fire('zoomend');
  }, [cats, marks, isAdmin, owners]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current; if (!m) return;
    for (const c of cats) { const g = layers.current[c.id]; if (!g) continue; if (isOn(c)) g.addTo(m); else g.remove(); }
    m.fire('zoomend');
  }, [on]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* маркер чернетки: білий з помаранчевою обводкою, щоб не сплутати з опублікованими мітками */
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!draftPt) { draftMarker.current?.remove(); draftMarker.current = null; return; }
    const ll = m.unproject(toPx(draftPt[0], draftPt[1]), ZMAX);
    if (draftMarker.current) { draftMarker.current.setLatLng(ll); return; }
    const icon = L.divIcon({ className: 'mpin-wrap', iconSize: [28, 28], iconAnchor: [14, 14], html: '<span class="mdr-pin"></span>' });
    draftMarker.current = L.marker(ll, { icon, draggable: isAdmin, title: 'Точка чернетки', zIndexOffset: 1000 }).addTo(m);
    draftMarker.current.on('dragend', () => { const p = m.project(draftMarker.current!.getLatLng(), ZMAX); setDraftPt(toGame(p.x, p.y)); });
  }, [draftPt, isAdmin]);
  function focusDraft(p: [number, number]) { const m = map.current; if (m) m.flyTo(m.unproject(toPx(p[0], p[1]), ZMAX), 5, { duration: 0.8 }); }

  function resetOn() { setOn(() => { const n: Record<string, boolean> = {}; for (const c of cats) n[c.id] = DEFAULT_GROUPS.has(c.grp); saveOn(n); return n; }); }
  function setMany(ids: string[], v: boolean) { setOn(o => { const n = { ...saved, ...o }; for (const id of ids) n[id] = v; saveOn(n); return n; }); }
  function pick(v: boolean, forDraft = false) { pickFor.current = forDraft ? 'draft' : 'mark'; pickRef.current = v; setPicking(v); if (v) { box.current?.focus(); if (!wide) box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
  function go(mk: MapMark) {
    const m = map.current; if (!m) return;
    const c = catById[mk.category]; if (c && !isOn(c)) setMany([c.id], true);
    m.flyTo(m.unproject(toPx(mk.x, mk.y), ZMAX), 5, { duration: 0.8 });
    if (!wide) box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  function startEdit(id: number) {
    const mk = marks.find(x => x.dbId === id); if (!mk) return;
    map.current?.closePopup(); setPanel(true); setTab('admin'); setEditing(mk);
    setTimeout(() => document.getElementById('mark-edit')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  async function delCat(c: MapCategory) {
    if (!confirm(`Видалити категорію «${c.name}» разом з усіма її мітками (${count[c.id] || 0})?`)) return;
    const { error } = await supabase!.from('map_categories').delete().eq('id', c.id);
    if (error) { alert('Не вдалося видалити: ' + error.message); return; }
    setCats(cs => cs.filter(x => x.id !== c.id)); setMarks(ms => ms.filter(x => x.category !== c.id));
  }

  const allIds = visibleCats.map(c => c.id);
  return (
    <div className={wide ? 'mapfull' : 'mapflow'} style={wide ? { top } : undefined}>
      <h1 className="vh">Мапа штату</h1>
      <div className={'mapbox' + (picking ? ' picking' : '')} style={{ background: OCEAN }}
        onClick={e => {
          const t = e.target as HTMLElement;
          const a = t.closest('a[data-nav]'); if (a) { e.preventDefault(); nav(a.getAttribute('href')!); return; }
          const d = t.closest('button[data-del]'); if (d) del(Number(d.getAttribute('data-del')));
          const ow = t.closest('button[data-owner]'); if (ow) setOwner(Number(ow.getAttribute('data-owner')));
          const ed = t.closest('button[data-edit]'); if (ed) startEdit(Number(ed.getAttribute('data-edit')));
        }}>
        <div ref={box} className="mapel" role="region" aria-label="Мапа штату" tabIndex={-1} />
        {picking && <span className="mpick">Клікни на мапі, щоб взяти координати</span>}
        {pos && <span className="mcoord mono">X {Math.round(pos[0])} · Y {Math.round(pos[1])}</span>}
        <span className="mbrand"><img src="/brand/q-hub-logo.svg" alt="" width="22" height="22" />Q-Hub</span>
      </div>
      {wide && <button type="button" className="mtoggle btn sm" onClick={() => setPanel(v => !v)} aria-expanded={panel} aria-controls="map-panel">
        <Icon name="map" size={16} />{panel ? 'Сховати панель' : 'Фільтри'}</button>}
        <aside id="map-panel" className={'mside' + (panel || !wide ? '' : ' hidden')}>
          <div className="fld has-ico msearch"><Icon name="search" /><input type="search" placeholder="Знайти мітку" value={q} onChange={e => setQ(e.target.value)} aria-label="Пошук на мапі" />
            {found.length > 0 && <ul className="mfound">{found.map(mk => <li key={mk.id}><button type="button" onClick={() => go(mk)}><img src={mk.icon || catById[mk.category]?.icon} alt="" width={18} height={18} />{mk.name || catById[mk.category]?.name}<small>{mk.name ? catById[mk.category]?.name : ''}</small></button></li>)}</ul>}
          </div>
          <div className="mtabs" role="tablist" aria-label="Панель мапи">
            <button type="button" role="tab" aria-selected={tab === 'filters'} onClick={() => setTab('filters')}>Фільтри</button>
            <button type="button" role="tab" aria-selected={tab === 'game'} onClick={() => setTab('game')}>Для гри</button>
            {isStaff && <button type="button" role="tab" aria-selected={tab === 'drafts'} onClick={() => setTab('drafts')}>Чернетки</button>}
            {isAdmin && <button type="button" role="tab" aria-selected={tab === 'admin'} onClick={() => setTab('admin')}>Адмін</button>}
          </div>
          {tab === 'drafts' && isStaff && <MapDrafts isAdmin={isAdmin} cats={cats} point={draftPt} picking={picking}
            onPoint={setDraftPt} onPick={v => pick(v, true)} onFocus={focusDraft}
            onPublished={mk => { setMarks(ms => [...ms, mk]); setMany([mk.category], true); }} />}
          {tab === 'filters' && <section className="mfilters" role="tabpanel" aria-label="Фільтри">
            <div className="mseg" role="group" aria-label="Усі категорії">
              <button type="button" onClick={() => setMany(allIds, true)} aria-pressed={allIds.length > 0 && visibleCats.every(isOn)}>Усі</button>
              <button type="button" onClick={resetOn}>Як спочатку</button>
              <button type="button" onClick={() => setMany(allIds, false)} aria-pressed={visibleCats.length > 0 && !visibleCats.some(isOn)}>Жодної</button>
            </div>
            {groups.map(({ grp, cats: gc }) => {
              const nOn = gc.filter(isOn).length, allOn = nOn === gc.length, open = !!openG[grp];
              return (
                <section key={grp} className={'mgrp' + (open ? ' open' : '')}>
                  <div className="mgrp-h">
                    <button type="button" className="mgrp-t" onClick={() => toggleG(grp)} aria-expanded={open}>
                      <svg className="mchev" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span>{grp}</span><span className={'mgrp-n' + (nOn ? ' on' : '')}>{nOn}/{gc.length}</span>
                    </button>
                    <button type="button" className="msw-b" role="switch" aria-checked={nOn > 0} onClick={() => setMany(gc.map(c => c.id), !allOn && nOn === 0 ? true : !allOn)}
                      aria-label={(nOn ? 'Сховати' : 'Показати') + ' групу ' + grp}><span className={'msw' + (nOn && !allOn ? ' part' : '')} aria-hidden="true" /></button>
                  </div>
                  {open && <div className="mchips">
                    {gc.map(c => {
                      const v = isOn(c);
                      return (
                        <span key={c.id} className={'mchip' + (v ? ' on' : '')} style={{ '--c': c.color } as CSSProperties}>
                          <button type="button" className="mchip-b" aria-pressed={v} onClick={() => setMany([c.id], !v)}>
                            <img src={c.icon} alt="" width={22} height={22} loading="lazy" /><span className="mcat-n">{c.name}</span><span className="cnt">{count[c.id] || 0}</span>
                          </button>
                          {isAdmin && !c.builtin && <button type="button" className="mcat-del" onClick={() => delCat(c)} aria-label={'Видалити категорію ' + c.name}>✕</button>}
                        </span>
                      );
                    })}
                  </div>}
                </section>
              );
            })}
          </section>}
          {tab === 'game' && <GameMapExport groups={groups} marks={marks} catById={catById} isOn={isOn} />}
          {tab === 'admin' && isAdmin && <>
            {editing && <div id="mark-edit"><MarkEdit key={editing.id} mark={editing} cats={cats} onCancel={() => setEditing(null)}
              onDone={mk => { setMarks(ms => ms.map(x => (x.id === mk.id ? mk : x))); setMany([mk.category], true); setEditing(null); }} /></div>}
            {dbMissing
              ? <p className="card err">Таблиць мапи в базі ще немає або вони старої версії. Запусти останній q-hub-map.sql у Supabase → SQL Editor і онови сторінку — тоді тут з'являться інструменти адміна.</p>
              : <MapAdmin cats={cats} picked={picked} picking={picking} onPick={pick}
                  onMarks={ms => { setMarks(x => [...x, ...ms]); setMany([...new Set(ms.map(m => m.category))], true); }} onCat={c => { setCats(x => [...x, c]); setMany([c.id], true); }} />}
          </>}
        </aside>
    </div>
  );
}
