import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OCEAN, ZMAX, makeHash, toGame, toPx } from '../lib/mapGeo';
import { groupCategories, type MapCategory, type MapMark } from '../lib/mapData';
import { BUILTIN, BUILTIN_MARKS, baseMap, esc, loadMapData, pinIcon } from '../lib/mapMarks';
import Icon from './Icon';

const HOME: [number, number] = [0, -800];
const HOME_Z = 2.5;
const MAX_SHOWN = 300;   // більше міток одночасно прев'ю не малює — для всього є повна мапа

/* мапа-прев'ю на головній: чиста мапа без міток; мітки з'являються, коли гравець шукає або вибирає групу */
export default function MiniMap() {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Record<string, L.Marker>>({});
  const nav = useNavigate();
  const [cats, setCats] = useState<MapCategory[]>(BUILTIN);
  const [marks, setMarks] = useState<MapMark[]>(BUILTIN_MARKS);
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('');
  const [center, setCenter] = useState<[number, number]>(HOME);
  const [view, setView] = useState(makeHash(HOME[0], HOME[1], Math.round(HOME_Z)));

  useEffect(() => { loadMapData().then(d => { if (d) { setCats(d.cats); setMarks(d.marks); } }); }, []);

  useEffect(() => {
    const el = box.current; if (!el) return;
    /* сторінку гортають колесом і пальцем — тому зум лише кнопками, а на сенсорних екранах мапу не тягають */
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const { m, ll } = baseMap(el, { scrollWheelZoom: false, dragging: !touch });
    m.setView(ll(...HOME), HOME_Z);
    const upd = () => { const c = m.project(m.getCenter(), ZMAX); const [x, y] = toGame(c.x, c.y); setCenter([x, y]); setView(makeHash(x, y, Math.round(m.getZoom()))); };
    m.on('moveend', upd); upd();
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; layer.current = null; };
  }, []);

  const catById = useMemo(() => Object.fromEntries(cats.map(c => [c.id, c])), [cats]);
  /* групи для кнопок над мапою: лише ті, де є мітки (шари мапи — це не мітки) */
  const groups = useMemo(() => groupCategories(cats.filter(c => marks.some(mk => mk.category === c.id))), [cats, marks]);
  const found = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (ql) return marks.filter(m => (m.name + ' ' + (catById[m.category]?.name || '')).toLowerCase().includes(ql));
    if (grp) { const ids = new Set(groups.find(g => g.grp === grp)?.cats.map(c => c.id)); return marks.filter(m => ids.has(m.category)); }
    return [];
  }, [q, grp, marks, catById, groups]);

  useEffect(() => {
    const g = layer.current, m = map.current; if (!g || !m) return;
    g.clearLayers(); markers.current = {};
    for (const mk of found.slice(0, MAX_SHOWN)) {
      const c = catById[mk.category]; if (!c) continue;
      const html = `<div class="mpop" style="--c:${c.color}"><span class="mtag">${esc(c.name)}</span><b>${esc(mk.name || c.name)}</b>${mk.note ? `<span>${esc(mk.note)}</span>` : ''}`
        + `<span class="mono mxy"><i>Координати</i>X ${Math.round(mk.x)} · Y ${Math.round(mk.y)}</span>`
        + (mk.link ? `<a class="mgo" data-nav href="${mk.link.href}">${mk.link.label}</a>` : '') + '</div>';
      markers.current[mk.id] = L.marker(m.unproject(toPx(mk.x, mk.y), ZMAX), { icon: pinIcon(c, mk.icon), title: mk.name || c.name, keyboard: true }).bindPopup(html).addTo(g);
    }
  }, [found, catById]);

  function go(mk: MapMark) {
    const m = map.current; if (!m) return;
    m.flyTo(m.unproject(toPx(mk.x, mk.y), ZMAX), 5, { duration: 0.8 });
    setTimeout(() => markers.current[mk.id]?.openPopup(), 850);
  }
  const list = q.trim() ? found.slice(0, 8) : [];

  return (
    <div className="mini">
      <div className="mini-chips" role="group" aria-label="Показати мітки групи">
        {groups.map(({ grp: g, cats: gc }) => {
          const n = marks.filter(mk => gc.some(c => c.id === mk.category)).length;
          return <button key={g} type="button" aria-pressed={grp === g} onClick={() => { setQ(''); setGrp(grp === g ? '' : g); }}>{g}<span>{n}</span></button>;
        })}
      </div>
      <div className="mini-map" style={{ background: OCEAN }}
        onClick={e => { const a = (e.target as HTMLElement).closest('a[data-nav]'); if (a) { e.preventDefault(); nav(a.getAttribute('href')!); } }}>
        <div ref={box} className="mapel" role="region" aria-label="Мапа штату (прев'ю)" />
        <div className="fld has-ico msearch mini-search">
          <Icon name="search" />
          <input type="search" placeholder="Пошук міток: магазин, банда, НЛО…" value={q} onChange={e => { setQ(e.target.value); setGrp(''); }} aria-label="Пошук міток на мапі" />
          {list.length > 0 && <ul className="mfound">{list.map(mk => <li key={mk.id}><button type="button" onClick={() => go(mk)}><img src={mk.icon || catById[mk.category]?.icon} alt="" width={18} height={18} />{mk.name || catById[mk.category]?.name}<small>{mk.name ? catById[mk.category]?.name : ''}</small></button></li>)}</ul>}
          {q.trim() && !found.length && <p className="mini-none">Нічого не знайдено</p>}
        </div>
        <div className="mini-ctl">
          <button type="button" className="hud hud-sq" onClick={() => map.current?.zoomIn()} aria-label="Збільшити" title="Збільшити"><Icon name="plus" size={18} /></button>
          <button type="button" className="hud hud-sq" onClick={() => map.current?.zoomOut()} aria-label="Зменшити" title="Зменшити"><Icon name="minus" size={18} /></button>
          <Link className="btn acc sm" to={'/mapa' + view}><Icon name="map" size={16} />На весь екран</Link>
        </div>
      </div>
      <div className="mini-foot">
        <span>{found.length ? `Показано міток: ${Math.min(found.length, MAX_SHOWN)}${found.length > MAX_SHOWN ? ` з ${found.length}` : ''}` : `Міток на мапі: ${marks.length}`}</span>
        <span className="mono">Центр: X {Math.round(center[0])} · Y {Math.round(center[1])}</span>
      </div>
    </div>
  );
}
