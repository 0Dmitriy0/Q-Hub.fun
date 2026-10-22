import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OCEAN, TILE, ZMAX, makeHash, parseHash, toGame, toPx } from '../lib/mapGeo';
import { POINTS, type MapPoint, type PointKind } from '../data/mapPoints';
import { JOBS } from '../data/jobs';
import Icon from '../components/Icon';

const KINDS: [PointKind, string, string][] = [['job', 'Роботи', 'jobs'], ['buyer', 'Скупники', 'buyer']];
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function pinIcon(p: MapPoint) {
  const src = p.kind === 'job' ? `/icons/jobs/${p.job}.svg` : p.id === 'buyer-junk' ? '/icons/junk/buyer.svg' : '/icons/harvest/buyer.svg';
  return L.divIcon({ className: 'mpin-wrap', html: `<span class="mpin ${p.kind}"><img src="${src}" alt="" width="26" height="26"></span>`, iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -18] });
}
function popupHtml(p: MapPoint) {
  if (p.kind === 'job') {
    const j = JOBS.find(x => x.id === p.job);
    return `<div class="mpop"><b>${esc(p.name)}</b><span>${j ? (j.legal ? 'Легальна' : 'Нелегальна') + ' · з ' + j.level + ' рівня' : 'Робота'}</span><a data-nav href="/roboty?job=${p.job}">Опис роботи →</a></div>`;
  }
  return `<div class="mpop"><b>${esc(p.name)}</b>${p.note ? `<span>${esc(p.note)}</span>` : ''}<a data-nav href="/tsiny">Ціни скупників →</a></div>`;
}

/* мапа штату на власних тайлах; точки — роботодавці й скупники з посиланнями на сторінки сайту */
export default function MapPage() {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<Record<PointKind, L.LayerGroup>>({} as Record<PointKind, L.LayerGroup>);
  const markers = useRef<Record<string, L.Marker>>({});
  const nav = useNavigate();
  const [on, setOn] = useState<Record<PointKind, boolean>>({ job: true, buyer: true });
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<[number, number] | null>(null);
  const counts = useMemo(() => ({ job: POINTS.filter(p => p.kind === 'job').length, buyer: POINTS.filter(p => p.kind === 'buyer').length }), []);
  const found = useMemo(() => { const ql = q.trim().toLowerCase(); return ql ? POINTS.filter(p => p.name.toLowerCase().includes(ql)).slice(0, 8) : []; }, [q]);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const m = L.map(el, { crs: L.CRS.Simple, minZoom: 1, maxZoom: ZMAX + 2, zoomSnap: 0.5, attributionControl: false, zoomControl: true });
    const ll = (x: number, y: number) => m.unproject(toPx(x, y), ZMAX);
    const full = TILE * 2 ** ZMAX;
    const bounds = L.latLngBounds(m.unproject([0, full], ZMAX), m.unproject([full, 0], ZMAX));
    m.setMaxBounds(bounds.pad(0.05));
    L.tileLayer('/map/{z}/{x}/{y}.webp', { maxNativeZoom: ZMAX, maxZoom: ZMAX + 2, tileSize: TILE, noWrap: true, bounds,
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' }).addTo(m);
    for (const [k] of KINDS) layers.current[k] = L.layerGroup().addTo(m);
    for (const p of POINTS) markers.current[p.id] = L.marker(ll(p.x, p.y), { icon: pinIcon(p), title: p.name, keyboard: true }).bindPopup(popupHtml(p)).addTo(layers.current[p.kind]);
    const h = parseHash(location.hash);
    if (h) m.setView(ll(h.x, h.y), h.z); else m.setView(ll(0, -800), 3);
    const coord = (e: L.LeafletMouseEvent) => { const pt = m.project(e.latlng, ZMAX); setPos(toGame(pt.x, pt.y)); };
    m.on('mousemove', coord); m.on('mouseout', () => setPos(null));
    m.on('moveend', () => { const c = m.project(m.getCenter(), ZMAX); const [x, y] = toGame(c.x, c.y); history.replaceState(null, '', makeHash(x, y, Math.round(m.getZoom()))); });
    map.current = m;
    return () => { m.remove(); map.current = null; markers.current = {}; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    for (const [k] of KINDS) { const g = layers.current[k]; if (on[k]) g.addTo(m); else g.remove(); }
  }, [on]);

  function go(p: MapPoint) {
    const m = map.current; if (!m) return;
    if (!on[p.kind]) setOn(o => ({ ...o, [p.kind]: true }));
    m.flyTo(m.unproject(toPx(p.x, p.y), ZMAX), 5, { duration: 0.8 });
    setTimeout(() => markers.current[p.id]?.openPopup(), 850);
    setQ('');
  }

  return (
    <>
      <div><h1>Мапа</h1><p className="muted">Мапа штату: роботодавці й скупники. Натисни на точку, щоб відкрити опис роботи або ціни. Посилання в адресному рядку веде саме туди, де ти зараз дивишся.</p></div>
      <div className="tbar">
        <div className="tabs" role="group" aria-label="Шари мапи">{KINDS.map(([k, label, ico]) => (
          <a key={k} href={'#' + k} role="switch" aria-checked={on[k]} className={'tabpic' + (on[k] ? ' active' : '')} onClick={e => { e.preventDefault(); setOn(o => ({ ...o, [k]: !o[k] })); }}>
            <Icon name={ico} size={16} />{label}<span className="cnt">{counts[k]}</span>
          </a>))}</div>
        <div className="tbar-row"><div className="fld has-ico grow msearch"><Icon name="search" /><input type="search" placeholder="Знайти на мапі: робота чи скупник" value={q} onChange={e => setQ(e.target.value)} aria-label="Пошук на мапі" />
          {found.length > 0 && <ul className="mfound" role="listbox">{found.map(p => <li key={p.id}><button type="button" onClick={() => go(p)}><Icon name={p.kind === 'job' ? 'jobs' : 'buyer'} size={15} />{p.name}</button></li>)}</ul>}
        </div></div>
      </div>
      <div className="mapbox" style={{ background: OCEAN }}
        onClick={e => { const a = (e.target as HTMLElement).closest('a[data-nav]'); if (a) { e.preventDefault(); nav(a.getAttribute('href')!); } }}>
        <div ref={box} className="mapel" role="region" aria-label="Мапа штату" />
        {pos && <span className="mcoord mono">X {Math.round(pos[0])} · Y {Math.round(pos[1])}</span>}
        <span className="mbrand"><img src="/brand/q-hub-logo.svg" alt="" width="22" height="22" />Q-Hub</span>
      </div>
    </>
  );
}
