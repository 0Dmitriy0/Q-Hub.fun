import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { OCEAN, PX_PER_M, TILE, ZMAX, makeHash, parseHash, toGame, toPx } from '../lib/mapGeo';
import { namesLayer } from '../lib/mapVector';
import { groupCategories, ownerLabel, type MapArea, type MapCategory, type MapMark } from '../lib/mapData';
import { BUILTIN, BUILTIN_MARKS, baseMap, esc, loadMapData, pinIcon } from '../lib/mapMarks';
import { isVisible, toggled } from '../lib/mapFilters';
import LABELS from '../data/mapLabels.json';
import ZONES from '../data/mapZones.json';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import MapAdmin, { CatEdit, MarkEdit } from '../components/MapAdmin';
import GameMapExport from '../components/GameMapExport';
import MapShot from '../components/MapShot';
import MapDrafts from '../components/MapDrafts';
import MapAreaDraw, { MapAreaEdit } from '../components/MapAreaDraw';

const ON_KEY = 'qhub:map:on';
const CLUSTER_MIN = 200;   // від скількох міток категорії групувати їх на віддаленні
const OPEN_KEY = 'qhub:map:open';
function readOpen(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}'); } catch { return {}; } }
function readOn(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(ON_KEY) || '{}'); } catch { return {}; } }
function saveOn(v: Record<string, boolean>) { try { localStorage.setItem(ON_KEY, JSON.stringify(v)); } catch { /* приватний режим */ } }

/* з якого зуму під мітками видно їхні назви */
const LABEL_ZOOM = 5;
/* стартовий вид; від його зуму рахуються відсотки на кнопках масштабу */
const HOME: [number, number] = [0, -800];
const HOME_Z = 3;
/* швидкі перемикачі шарів у верхній панелі (як «Зони & GZ» у макеті) */
const QUICK: [string, string][] = [['zones', 'Зелені зони'], ['names', 'Назви']];

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
  /* зони (0021): багатокутники в шарах своїх категорій; адмін малює нову кліками по мапі */
  const [areas, setAreas] = useState<MapArea[]>([]);
  const [ring, setRing] = useState<[number, number][]>([]);
  const [drawing, setDrawing] = useState(false);
  const drawRef = useRef(false);
  const ringLayer = useRef<L.LayerGroup | null>(null);
  /* зона, яку адмін зараз змінює, і її контур у роботі (зберігається лише кнопкою в MapAreaEdit) */
  const [edArea, setEdArea] = useState<MapArea | null>(null);
  const [edRing, setEdRing] = useState<[number, number][]>([]);
  const edLayer = useRef<L.LayerGroup | null>(null);
  const [cats, setCats] = useState<MapCategory[]>(BUILTIN);
  const [marks, setMarks] = useState<MapMark[]>(BUILTIN_MARKS);
  const [saved] = useState(readOn);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState(HOME_Z);
  const [copied, setCopied] = useState(false);
  const qRef = useRef<HTMLInputElement>(null);
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

  /* ?show=pryvydy (банер на головній; значення — id категорії в базі): лише ця категорія й назви місць, збережені фільтри не чіпаємо,
     доки гравець сам щось не перемкне; немає такої категорії чи міток у ній — звичайна мапа */
  const [only, setOnly] = useState<string | null>(() => (supabase && new URLSearchParams(location.search).get('show')) || null);
  const isOn = (c: MapCategory) => isVisible(c, { only, on, saved });
  /* панель: вкладки й згорнуті групи */
  /* інструменти адміна й чернетки — окрема плитка праворуч, відкривається кнопкою внизу мапи */
  const [tab, setTab] = useState<'admin' | 'drafts'>('admin');
  const [tools, setTools] = useState(false);
  /* скільки нових чернеток з F9 чекає адміна — видно на кнопці внизу мапи; є нові — плитка відкривається одразу на них */
  const [newDrafts, setNewDrafts] = useState(0);
  useEffect(() => {
    if (!supabase || !isAdmin || tools) return;
    supabase.from('map_drafts').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(({ count, error }) => { if (!error && count != null) { setNewDrafts(count); if (count) setTab('drafts'); } });
  }, [isAdmin, tools]);
  /* яку категорію відкрити у формі «Змінити категорію» (олівець на плитці категорії) */
  const [catPick, setCatPick] = useState<string | null>(null);
  /* «Мапа для гри» — вікно по центру екрана; ?game=1 відкриває його одразу (посилання з головної) */
  const [params] = useSearchParams();
  const [game, setGame] = useState(() => params.get('game') === '1');
  const dlg = useRef<HTMLDialogElement>(null);
  /* «Скрін мапи» — таке саме вікно з картинкою всієї мапи й увімкнених міток */
  const [shotOpen, setShotOpen] = useState(false);
  const shotDlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = shotDlg.current; if (!d) return;
    if (shotOpen && !d.open) d.showModal(); else if (!shotOpen && d.open) d.close();
  }, [shotOpen]);
  useEffect(() => {
    if (params.get('game') || params.get('show')) history.replaceState(null, '', location.pathname + location.hash);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const d = dlg.current; if (!d) return;
    if (game && !d.open) d.showModal(); else if (!game && d.open) d.close();
  }, [game]);
  const [openG, setOpenG] = useState<Record<string, boolean>>(readOpen);
  const toggleG = (g: string) => setOpenG(o => { const n = { ...o, [g]: !o[g] }; try { localStorage.setItem(OPEN_KEY, JSON.stringify(n)); } catch { /* приватний режим */ } return n; });
  const count = useMemo(() => { const n: Record<string, number> = { names: LABELS.length, zones: ZONES.length }; for (const m of [...marks, ...areas]) n[m.category] = (n[m.category] || 0) + 1; return n; }, [marks, areas]);
  /* гостям порожні категорії не показуємо — лише адміну, щоб він міг їх наповнити */
  const visibleCats = useMemo(() => cats.filter(c => c.builtin || isAdmin || count[c.id]), [cats, count, isAdmin]);
  const groups = useMemo(() => groupCategories(visibleCats), [visibleCats]);
  const catById = useMemo(() => Object.fromEntries(cats.map(c => [c.id, c])), [cats]);
  const found = useMemo(() => {
    const ql = q.trim().toLowerCase(); if (!ql) return [];
    return marks.filter(m => (m.name + ' ' + (catById[m.category]?.name || '')).toLowerCase().includes(ql)).slice(0, 10);
  }, [q, marks, catById]);

  /* dataV — перечитати мітки з бази (після публікації чи відкату партії) */
  const [dataV, setDataV] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    loadMapData().then(d => {
      if (!d) { setDbMissing(true); setOnly(null); return; }
      if (d.areas) setAreas(d.areas);
      if (d.owners) setOwners(d.owners);
      setCats(d.cats); setMarks(d.marks);
      setOnly(o => (o && d.marks.some(mk => mk.category === o) ? o : null));
    });
  }, [dataV]);

  useEffect(() => {
    const el = box.current; if (!el) return;
    /* кнопки масштабу — свої, у HUD (див. .mzoom), тому стандартний контрол Leaflet вимкнено (baseMap) */
    const { m, ll } = baseMap(el);
    const np = m.createPane('names'); np.style.zIndex = '450'; np.style.pointerEvents = 'none';   // назви над зеленими зонами (overlayPane 400), під мітками (600)
    const h = parseHash(location.hash);
    if (h) m.setView(ll(h.x, h.y), h.z); else m.setView(ll(...HOME), HOME_Z);
    const game = (e: L.LeafletMouseEvent) => { const pt = m.project(e.latlng, ZMAX); return toGame(pt.x, pt.y); };
    /* координати курсора лишаються після виходу з мапи — щоб їх можна було скопіювати кнопкою в HUD */
    m.on('mousemove', e => setPos(game(e)));
    m.on('click', e => {
      if (drawRef.current) { const g = game(e); setRing(r => [...r, g]); return; }
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
      setZoom(m.getZoom());
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
    /* велика категорія (specs/017: 700+ гарбузів) — близькі мітки на віддаленні збираються в один значок з числом */
    const per: Record<string, number> = {}; for (const mk of marks) per[mk.category] = (per[mk.category] || 0) + 1;
    for (const c of cats) layers.current[c.id] = (per[c.id] || 0) > CLUSTER_MIN
      ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40, disableClusteringAtZoom: ZMAX - 1, iconCreateFunction: g => L.divIcon({ className: 'mclu-wrap', iconSize: [34, 34], html: `<span class="mclu" style="--c:${c.color}"><img src="${esc(c.icon)}" alt="">${g.getChildCount()}</span>` }) })
      : L.layerGroup();
    for (const mk of marks) {
      const c = catById[mk.category]; if (!c) continue;
      const icon = pinIcon(c, mk.icon);
      /* картка точки як у макеті: мітка-категорія кольору категорії, назва, примітка, смужка координат, дія */
      const html = `<div class="mpop" style="--c:${c.color}"><span class="mtag">${esc(c.name)}</span><b>${esc(mk.name || c.name)}</b>${mk.note ? `<span>${esc(mk.note)}</span>` : ''}`
        + (mk.owner ? `<span class="mowner">Власник: <b>${esc(ownerLabel(mk.owner, owners))}</b></span>` : '')
        + `<span class="mono mxy"><i>Координати</i>X ${Math.round(mk.x)} · Y ${Math.round(mk.y)}</span>`
        + (mk.link ? `<a class="mgo" data-nav href="${mk.link.href}">${mk.link.label}</a>` : '')
        + (isAdmin && mk.dbId ? `<span class="mrow"><button type="button" class="medit" data-edit="${mk.dbId}">Змінити</button><button type="button" class="medit" data-owner="${mk.dbId}">Власник</button><button type="button" class="mdel" data-del="${mk.dbId}">Видалити</button></span>` : '') + '</div>';
      markers.current[mk.id] = L.marker(m.unproject(toPx(mk.x, mk.y), ZMAX), { icon, title: mk.name || c.name, keyboard: true }).bindPopup(html).addTo(layers.current[c.id]);
      /* назва під міткою; на дальньому зумі ховається (див. .mlabels-on), щоб не було каші */
      if (mk.name && mk.label !== false) markers.current[mk.id].bindTooltip(esc(mk.name), { permanent: true, direction: 'bottom', offset: [0, 16], className: 'mlabel' });
    }
    /* зони з бази: заливка кольору категорії, клік — назва й примітка (адміну — «Змінити» й «Видалити»);
       зону, яку зараз змінюють, малює окремий шар правки */
    for (const ar of areas) {
      const c = catById[ar.category]; if (!c || !layers.current[c.id] || ar.dbId === edArea?.dbId) continue;
      const html = `<div class="mpop" style="--c:${c.color}"><span class="mtag">${esc(c.name)}</span><b>${esc(ar.name || c.name)}</b>${ar.note ? `<span>${esc(ar.note)}</span>` : ''}`
        + (isAdmin ? `<span class="mrow"><button type="button" class="medit" data-edit-area="${ar.dbId}">Змінити / перенести</button><button type="button" class="mdel" data-del-area="${ar.dbId}">Видалити зону</button></span>` : '') + '</div>';
      L.polygon(ar.ring.map(([x, y]) => m.unproject(toPx(x, y), ZMAX)), { color: c.color, weight: 2, fillColor: c.color, fillOpacity: 0.28 }).bindPopup(html).addTo(layers.current[c.id]);
    }
    /* шари мапи: зелені зони й назви місць (дані з експорту Hydra, scripts/minimap) */
    const ll = (x: number, y: number) => m.unproject(toPx(x, y), ZMAX);
    if (layers.current.zones) for (const z of ZONES as number[][][][]) L.polygon(z.map(r => r.map(([x, y]) => ll(x, y))), { color: '#9ff0b8', weight: 1.5, dashArray: '6 5', fillColor: '#2ea057', fillOpacity: 0.26, interactive: false }).addTo(layers.current.zones);
    /* назви — трикутники тексту Hydra частиною мапи, як у грі (namesLayer) */
    if (layers.current.names) { const full = TILE * 2 ** ZMAX; namesLayer(ZMAX, PX_PER_M, ZMAX + 2, L.latLngBounds(m.unproject([0, full], ZMAX), m.unproject([full, 0], ZMAX))).addTo(layers.current.names); }
    for (const c of cats) if (isOn(c)) layers.current[c.id].addTo(m);
    m.fire('zoomend');
  }, [cats, marks, areas, isAdmin, owners, edArea]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current; if (!m) return;
    for (const c of cats) { const g = layers.current[c.id]; if (!g) continue; if (isOn(c)) g.addTo(m); else g.remove(); }
    m.fire('zoomend');
  }, [on, only]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ?show= без координат в адресі: кадр — на всі мітки категорії (привиди розкидані по всьому штату), один раз */
  const fitted = useRef(!!parseHash(location.hash));
  useEffect(() => {
    const m = map.current; if (!m || !only || fitted.current) return;
    const pts = marks.filter(mk => mk.category === only); if (!pts.length) return;
    fitted.current = true;
    m.fitBounds(L.latLngBounds(pts.map(mk => m.unproject(toPx(mk.x, mk.y), ZMAX))), { paddingTopLeft: [wide ? 380 : 30, 90], paddingBottomRight: [30, 30] });
  }, [marks, only]);   // eslint-disable-line react-hooks/exhaustive-deps

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
  /* контур нової зони: лінія через точки й пунктир до першої (замкнеться при збереженні) */
  useEffect(() => {
    const m = map.current; if (!m) return;
    ringLayer.current?.remove(); ringLayer.current = null;
    if (!ring.length) return;
    const ll = ring.map(([x, y]) => m.unproject(toPx(x, y), ZMAX)), g = L.layerGroup().addTo(m);
    L.polyline(ll, { color: '#ff6a1f', weight: 3 }).addTo(g);
    if (ll.length > 2) L.polyline([ll[ll.length - 1], ll[0]], { color: '#ff6a1f', weight: 2, dashArray: '6 6' }).addTo(g);
    for (const p of ll) L.circleMarker(p, { radius: 4, color: '#fff', weight: 2, fillColor: '#ff6a1f', fillOpacity: 1, interactive: false }).addTo(g);
    ringLayer.current = g;
  }, [ring]);
  /* правка зони: точки межі тягнуться, середина ребра — нова точка (клік або перетягування), подвійний клік — прибрати
     точку, ручка в центрі переносить усю зону. Під час перетягування контур оновлюється без React, у стан — на dragend */
  useEffect(() => {
    const m = map.current; if (!m) return;
    edLayer.current?.remove(); edLayer.current = null;
    if (!edArea || edRing.length < 3) return;
    const col = catById[edArea.category]?.color || '#ff6a1f';
    const ll = (p: [number, number]) => m.unproject(toPx(p[0], p[1]), ZMAX);
    const gm = (x: L.LatLng) => { const p = m.project(x, ZMAX); return toGame(p.x, p.y); };
    const ico = (cls: string, s: number) => L.divIcon({ className: 'mpin-wrap', iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: `<span class="${cls}"></span>` });
    const g = L.layerGroup().addTo(m), n = edRing.length, pts = edRing.map(ll);
    const poly = L.polygon(pts, { color: col, weight: 3, dashArray: '8 6', fillColor: col, fillOpacity: 0.35, interactive: false }).addTo(g);
    const vIco = ico('mvx', 16), midIco = ico('mvx mid', 12);
    edRing.forEach((_, i) => {
      const v = L.marker(pts[i], { icon: vIco, draggable: true, title: 'Тягни точку · подвійний клік — прибрати', zIndexOffset: 500 }).addTo(g);
      v.on('drag', () => { pts[i] = v.getLatLng(); poly.setLatLngs(pts); });
      v.on('dragend', () => setEdRing(r => r.map((q, j) => (j === i ? gm(v.getLatLng()) : q))));
      v.on('dblclick', () => setEdRing(r => (r.length > 3 ? r.filter((_, j) => j !== i) : r)));
      const a = edRing[i], b = edRing[(i + 1) % n], mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const h = L.marker(ll(mid), { icon: midIco, draggable: true, title: 'Потягни або клікни — нова точка', zIndexOffset: 400 }).addTo(g);
      h.on('drag', () => poly.setLatLngs([...pts.slice(0, i + 1), h.getLatLng(), ...pts.slice(i + 1)]));
      h.on('dragend', () => setEdRing(r => [...r.slice(0, i + 1), gm(h.getLatLng()), ...r.slice(i + 1)]));
      h.on('click', () => setEdRing(r => [...r.slice(0, i + 1), mid, ...r.slice(i + 1)]));
    });
    const cen: [number, number] = [edRing.reduce((s, p) => s + p[0], 0) / n, edRing.reduce((s, p) => s + p[1], 0) / n];
    const mv = L.marker(ll(cen), { icon: ico('mmove', 34), draggable: true, title: 'Тягни, щоб перенести всю зону', zIndexOffset: 1000 }).addTo(g);
    const start = m.project(ll(cen), ZMAX), shift = () => m.project(mv.getLatLng(), ZMAX).subtract(start);
    mv.on('drag', () => { const d = shift(); poly.setLatLngs(edRing.map(p => { const q = toPx(p[0], p[1]); return m.unproject([q[0] + d.x, q[1] + d.y], ZMAX); })); });
    mv.on('dragend', () => { const d = shift(), dx = d.x / PX_PER_M, dy = -d.y / PX_PER_M; setEdRing(r => r.map(([x, y]) => [x + dx, y + dy] as [number, number])); });
    edLayer.current = g;
  }, [edRing, edArea]);   // eslint-disable-line react-hooks/exhaustive-deps
  function startAreaEdit(id: number) {
    const a = areas.find(x => x.dbId === id); if (!a) return;
    map.current?.closePopup(); draw(false); setRing([]); setTools(true); setTab('admin'); setEdArea(a); setEdRing(a.ring);
    setTimeout(() => document.getElementById('area-edit')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  function stopAreaEdit() { setEdArea(null); setEdRing([]); }
  function draw(v: boolean) { drawRef.current = v; setDrawing(v); if (v) { pickRef.current = false; setPicking(false); stopAreaEdit(); } }
  async function delArea(id: number) {
    if (!confirm('Видалити цю зону з мапи?')) return;
    const { error } = await supabase!.from('map_areas').delete().eq('id', id);
    if (error) { alert('Не вдалося видалити: ' + error.message); return; }
    map.current?.closePopup(); setAreas(as => as.filter(a => a.dbId !== id));
  }
  function focusDraft(p: [number, number]) { const m = map.current; if (m) m.flyTo(m.unproject(toPx(p[0], p[1]), ZMAX), 5, { duration: 0.8 }); }
  function zoomHome() { const m = map.current; if (m) m.setView(m.unproject(toPx(...HOME), ZMAX), HOME_Z); }
  async function copyPos() {
    if (!pos) return;
    try { await navigator.clipboard.writeText(`${Math.round(pos[0])} ${Math.round(pos[1])}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* без доступу до буфера */ }
  }
  /* «/» — у пошук, як підказує kbd у полі (коли курсор не в іншому полі вводу) */
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault(); qRef.current?.focus();
    };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, []);

  /* перше перемикання після ?show= береться від того, що гравець бачить зараз, і зберігається як звичайно */
  function setMany(ids: string[], v: boolean) {
    if (only) setOnly(null);
    setOn(o => { const n = toggled(cats, { only, on: o, saved }, ids, v); saveOn(n); return n; }); }
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
    map.current?.closePopup(); setTools(true); setTab('admin'); setEditing(mk);
    setTimeout(() => document.getElementById('mark-edit')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  async function delCat(c: MapCategory) {
    if (!confirm(`Видалити категорію «${c.name}» разом з усіма її мітками (${count[c.id] || 0})?`)) return;
    const { error } = await supabase!.from('map_categories').delete().eq('id', c.id);
    if (error) { alert('Не вдалося видалити: ' + error.message); return; }
    setCats(cs => cs.filter(x => x.id !== c.id)); setMarks(ms => ms.filter(x => x.category !== c.id));
  }

  const allIds = visibleCats.map(c => c.id);
  /* пошук: на комп'ютері — у верхній панелі над мапою, на телефоні — у панелі під мапою */
  const search = (
    <div className="fld has-ico msearch"><Icon name="search" /><input ref={qRef} type="search" placeholder="Знайти мітку" value={q} onChange={e => setQ(e.target.value)} aria-label="Пошук на мапі" aria-keyshortcuts="/" />
      {wide && <kbd className="mkbd" aria-hidden="true">/</kbd>}
      {found.length > 0 && <ul className="mfound">{found.map(mk => <li key={mk.id}><button type="button" onClick={() => go(mk)}><img src={mk.icon || catById[mk.category]?.icon} alt="" width={18} height={18} />{mk.name || catById[mk.category]?.name}<small>{mk.name ? catById[mk.category]?.name : ''}</small></button></li>)}</ul>}
    </div>
  );
  return (
    <div className={wide ? 'mapfull' : 'mapflow'} style={wide ? { top } : undefined}>
      <h1 className="vh">Мапа штату</h1>
      <div className={'mapbox' + (picking ? ' picking' : '')} style={{ background: OCEAN }}
        onClick={e => {
          const t = e.target as HTMLElement;
          const a = t.closest('a[data-nav]'); if (a) { e.preventDefault(); nav(a.getAttribute('href')!); return; }
          const d = t.closest('button[data-del]'); if (d) del(Number(d.getAttribute('data-del')));
          const da = t.closest('button[data-del-area]'); if (da) delArea(Number(da.getAttribute('data-del-area')));
          const ea = t.closest('button[data-edit-area]'); if (ea) startAreaEdit(Number(ea.getAttribute('data-edit-area')));
          const ow = t.closest('button[data-owner]'); if (ow) setOwner(Number(ow.getAttribute('data-owner')));
          const ed = t.closest('button[data-edit]'); if (ed) startEdit(Number(ed.getAttribute('data-edit')));
        }}>
        <div ref={box} className="mapel" role="region" aria-label="Мапа штату" tabIndex={-1} />
        {picking && <span className="mpick">Клікни на мапі, щоб взяти координати</span>}
        {drawing && <span className="mpick">Клікай точки межі зони · точок: {ring.length}</span>}
        {!wide && pos && <span className="mcoord mono">X {Math.round(pos[0])} · Y {Math.round(pos[1])}</span>}
        <span className="mbrand"><img src="/brand/q-hub-logo.svg" alt="" width="22" height="22" />Q-Hub</span>
        {/* HUD за макетом Stitch (design/stitch/mapa.html): координати й пошук зліва, шари, масштаб і мапа для гри справа */}
        <div className="mhud">
          {wide && <div className="mhud-l">
            <div className="hud mgps">
              <span className="mdot" aria-hidden="true" />
              <span className="mono"><i>X</i><b>{pos ? Math.round(pos[0]) : '—'}</b><i>·</i><i>Y</i><b>{pos ? Math.round(pos[1]) : '—'}</b></span>
              <button type="button" className="hud-b" onClick={copyPos} disabled={!pos} aria-label="Скопіювати координати" title={copied ? 'Скопійовано' : 'Скопіювати координати'}><Icon name={copied ? 'check' : 'copy'} size={16} /></button>
            </div>
            {search}
          </div>}
          <div className="mhud-r">
            {wide && <div className="hud mquick" role="group" aria-label="Шари мапи">
              {QUICK.map(([id, label]) => { const c = catById[id]; if (!c) return null; const v = isOn(c);
                return <button key={id} type="button" aria-pressed={v} onClick={() => setMany([id], !v)}><Icon name="layers" size={16} />{label}</button>; })}
            </div>}
            <div className="hud mzoom" role="group" aria-label="Масштаб">
              <button type="button" className="hud-b" onClick={() => map.current?.zoomIn()} aria-label="Збільшити" title="Збільшити"><Icon name="plus" size={18} /></button>
              <button type="button" className="hud-b mono" onClick={zoomHome} title="Повернути початковий вигляд">{Math.round(2 ** (zoom - HOME_Z) * 100)}%</button>
              <button type="button" className="hud-b" onClick={() => map.current?.zoomOut()} aria-label="Зменшити" title="Зменшити"><Icon name="minus" size={18} /></button>
            </div>
            {wide && <button type="button" className="hud mmod mshot-b" onClick={() => setShotOpen(true)} title="Скрін усієї мапи з увімкненими мітками"><Icon name="camera" size={18} /><span>Скрін</span></button>}
            {wide && <button type="button" className="hud mmod" onClick={() => setGame(true)}><Icon name="download" size={18} /><span>Мапа для гри</span></button>}
          </div>
        </div>
        {(isStaff || isAdmin) && !tools && <button type="button" className="hud mtools-b" onClick={() => { setTools(true); if (!isAdmin) setTab('drafts'); }} aria-expanded={false} aria-controls="map-tools">
          <Icon name="gear" size={18} />{isAdmin ? 'Адмін' : 'Чернетки'}{isAdmin && newDrafts > 0 && <span className="mtools-n mono">{newDrafts} з F9</span>}</button>}
      </div>
      {wide && !panel && <button type="button" className="hud mtoggle" onClick={() => setPanel(true)} aria-expanded={false} aria-controls="map-panel"><Icon name="map" size={16} />Фільтри міток</button>}
        <aside id="map-panel" className={'mside' + (panel || !wide ? '' : ' hidden')}>
          <div className="mside-h">
            <span className="mside-t">Фільтри міток</span>
            <span className="mside-n mono">міток: {marks.length + areas.length}</span>
            {wide && <button type="button" className="hud-b" onClick={() => setPanel(false)} aria-expanded={true} aria-controls="map-panel" aria-label="Сховати панель" title="Сховати панель"><Icon name="x" size={16} /></button>}
          </div>
          {!wide && search}
          {!wide && <button type="button" className="btn ghost mmod-m" onClick={() => setShotOpen(true)}><Icon name="camera" size={18} />Скрін мапи з мітками</button>}
          {!wide && <button type="button" className="btn ghost mmod-m" onClick={() => setGame(true)}><Icon name="download" size={18} />Мапа для гри</button>}
          {!wide && (isStaff || isAdmin) && !tools && <button type="button" className="btn ghost mmod-m" onClick={() => { setTools(true); if (!isAdmin) setTab('drafts'); }}><Icon name="gear" size={18} />{isAdmin ? 'Інструменти адміна' : 'Чернетки'}</button>}
          <section className="mfilters" aria-label="Фільтри">
            <div className="mseg" role="group" aria-label="Усі категорії">
              <button type="button" onClick={() => setMany(allIds, true)} aria-pressed={allIds.length > 0 && visibleCats.every(isOn)}>Усі</button>
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
                          {isAdmin && !c.builtin && <button type="button" className="mcat-edit" onClick={() => { setCatPick(c.id); setTab('admin'); setTools(true); }} aria-label={'Змінити категорію ' + c.name} title="Змінити категорію"><Icon name="tag" size={12} /></button>}
                          {isAdmin && !c.builtin && <button type="button" className="mcat-del" onClick={() => delCat(c)} aria-label={'Видалити категорію ' + c.name}>✕</button>}
                        </span>
                      );
                    })}
                  </div>}
                </section>
              );
            })}
          </section>
        </aside>
        {(isStaff || isAdmin) && tools && <aside id="map-tools" className="mside mtools" aria-label="Інструменти мапи">
          <div className="mside-h">
            <span className="mside-t">{isAdmin ? 'Адмін мапи' : 'Чернетки'}</span>
            <button type="button" className="hud-b" onClick={() => setTools(false)} aria-label="Закрити інструменти" title="Закрити"><Icon name="x" size={16} /></button>
          </div>
          {isAdmin && isStaff && <div className="mtabs" role="tablist" aria-label="Інструменти">
            <button type="button" role="tab" aria-selected={tab === 'admin'} onClick={() => setTab('admin')}>Мітки й зони</button>
            <button type="button" role="tab" aria-selected={tab === 'drafts'} onClick={() => setTab('drafts')}>Чернетки з F9{newDrafts > 0 ? ` · ${newDrafts}` : ''}</button>
          </div>}
          {(tab === 'drafts' || !isAdmin) && isStaff && <MapDrafts isAdmin={isAdmin} cats={cats} marks={marks} point={draftPt} picking={picking}
            onPoint={setDraftPt} onPick={v => pick(v, true)} onFocus={focusDraft}
            onPublished={mk => { setMarks(ms => [...ms, mk]); setMany([mk.category], true); }} />}
          {tab === 'admin' && isAdmin && <>
            {editing && <div id="mark-edit"><MarkEdit key={editing.id} mark={editing} cats={cats} onCancel={() => setEditing(null)}
              onDone={mk => { setMarks(ms => ms.map(x => (x.id === mk.id ? mk : x))); setMany([mk.category], true); setEditing(null); }} /></div>}
            {edArea && <div id="area-edit"><MapAreaEdit key={edArea.id} area={edArea} cats={cats} ring={edRing} onReset={() => setEdRing(edArea.ring)} onCancel={stopAreaEdit}
              onDone={a => { setAreas(as => as.map(x => (x.dbId === a.dbId ? a : x))); setMany([a.category], true); stopAreaEdit(); }} /></div>}
            {dbMissing
              ? <p className="card err">Таблиць мапи в базі ще немає або вони старої версії. Запусти останній q-hub-map.sql у Supabase → SQL Editor і онови сторінку — тоді тут з'являться інструменти адміна.</p>
              : <><CatEdit key={catPick || ''} cats={cats} pick={catPick} onSaved={c => setCats(cs => cs.map(x => (x.id === c.id ? c : x)))} />
                <MapAreaDraw cats={cats} ring={ring} drawing={drawing} onDraw={draw} onUndo={() => setRing(r => r.slice(0, -1))} onClear={() => setRing([])}
                  onAdded={a => { setAreas(as => [...as, a]); setRing([]); draw(false); setMany([a.category], true); }} />
                <MapAdmin cats={cats} marks={marks} picked={picked} picking={picking} onPick={pick} onReload={() => setDataV(v => v + 1)}
                  onMarks={ms => { setMarks(x => [...x, ...ms]); setMany([...new Set(ms.map(m => m.category))], true); }} onCat={c => { setCats(x => [...x, c]); setMany([c.id], true); }} /></>}
          </>}
        </aside>}
      <dialog ref={dlg} className="mdlg" aria-labelledby="mdlg-t" onClose={() => setGame(false)} onClick={e => { if (e.target === dlg.current) setGame(false); }}>
        <div className="mdlg-in">
          <div className="mdlg-h">
            <span className="mdlg-ico" aria-hidden="true"><Icon name="download" size={20} /></span>
            <div><h2 id="mdlg-t">Мапа для гри</h2><small>Заміна мінікарти GTA V через OpenIV</small></div>
            <button type="button" className="hud-b" onClick={() => setGame(false)} aria-label="Закрити" title="Закрити"><Icon name="x" size={18} /></button>
          </div>
          {game && <GameMapExport groups={groups} marks={marks} areas={areas} catById={catById} isOn={isOn} />}
        </div>
      </dialog>
      <dialog ref={shotDlg} className="mdlg" aria-labelledby="mshot-t" onClose={() => setShotOpen(false)} onClick={e => { if (e.target === shotDlg.current) setShotOpen(false); }}>
        <div className="mdlg-in">
          <div className="mdlg-h">
            <span className="mdlg-ico" aria-hidden="true"><Icon name="camera" size={20} /></span>
            <div><h2 id="mshot-t">Скрін мапи</h2><small>Уся мапа з увімкненими мітками · PNG або SVG</small></div>
            <button type="button" className="hud-b" onClick={() => setShotOpen(false)} aria-label="Закрити" title="Закрити"><Icon name="x" size={18} /></button>
          </div>
          {shotOpen && <MapShot marks={marks} areas={areas} catById={catById} isOn={isOn} />}
        </div>
      </dialog>
    </div>
  );
}
