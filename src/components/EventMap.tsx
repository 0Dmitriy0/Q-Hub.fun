import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { ZMAX, toPx } from '../lib/mapGeo';
import type { MapCategory, MapMark } from '../lib/mapData';
import { baseMap, esc, loadMapData, photoHtml, pinIcon } from '../lib/mapMarks';
import { asset } from '../lib/app';

/* міні-мапа на сторінці івенту (specs/055 US2): мітки прив'язаних категорій з тих самих даних, що велика мапа
   (loadMapData — гість бачить лише опубліковані партії), кадр на всі мітки один раз. Leaflet створюється лише
   коли блок видно — тайли не вантажаться, доки гравець не доскролив */
export default function EventMap({ categoryIds, onCount }: { categoryIds: string[]; onCount?: (n: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [data, setData] = useState<{ cats: MapCategory[]; marks: MapMark[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const key = categoryIds.join(',');

  useEffect(() => {
    let live = true;
    loadMapData().then(d => {
      if (!live) return;
      if (!d) { setFailed(true); return; }
      const ids = new Set(categoryIds);
      const marks = d.marks.filter(m => ids.has(m.category));
      setData({ cats: d.cats, marks }); onCount?.(marks.length);
    }, () => live && setFailed(true));
    return () => { live = false; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = box.current; if (!el || seen) return;
    if (typeof IntersectionObserver !== 'function') { setSeen(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    const el = box.current; if (!el || !seen || !data) return;
    /* сторінку гортають колесом і пальцем — зум лише кнопками, на сенсорних екранах мапу не тягають (як MiniMap) */
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    let made: ReturnType<typeof baseMap>;
    try { made = baseMap(el, { scrollWheelZoom: false, dragging: !touch, zoomControl: true }); }
    catch { setFailed(true); return; }
    const { m } = made;
    const byId = Object.fromEntries(data.cats.map(c => [c.id, c]));
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40 });
    const pts: L.LatLng[] = [];
    for (const mk of data.marks) {
      const c = byId[mk.category]; if (!c) continue;
      const at = m.unproject(toPx(mk.x, mk.y), ZMAX); pts.push(at);
      const html = `<div class="mpop" style="--c:${c.color}"><span class="mtag">${esc(c.name)}</span>${photoHtml(mk)}<b>${esc(mk.name || c.name)}</b>`
        + (mk.note ? `<span>${esc(mk.note)}</span>` : '') + `<span class="mono mxy"><i>Координати</i>X ${Math.round(mk.x)} · Y ${Math.round(mk.y)}</span></div>`;
      group.addLayer(L.marker(at, { icon: pinIcon(c, mk.icon), title: mk.name || c.name, keyboard: true }).bindPopup(html));
    }
    group.addTo(m);
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 5, animate: false });
    else m.setView(m.unproject(toPx(0, -800), ZMAX), 2.5);
    const ro = new ResizeObserver(() => m.invalidateSize()); ro.observe(el);
    return () => { ro.disconnect(); m.remove(); };
  }, [seen, data]);

  /* легенда: що саме позначено (напр. «Гарбузи з цукерками» — не квестові) і скільки */
  const legend = data ? data.cats.filter(c => categoryIds.includes(c.id)).map(c => ({ c, n: data.marks.filter(m => m.category === c.id).length })) : [];
  if (failed) return <div className="card empty">Мапу не вдалося завантажити. Онови сторінку.</div>;
  return (
    <>
      <div ref={box} className="ev-map" role="region" aria-label="Мапа локацій івенту" />
      {legend.length > 0 && <ul className="ev-legend" aria-label="Що позначено на мапі">{legend.map(({ c, n }) => (
        <li key={c.id}><span className="ev-legend-pin" style={{ borderColor: c.color }}><img src={asset(c.icon)} alt="" width={18} height={18} /></span>
          <span><b>{c.name}</b>{c.description && <small className="muted"> — {c.description}</small>}</span><span className="mono muted">{n}</span></li>))}</ul>}
    </>
  );
}
