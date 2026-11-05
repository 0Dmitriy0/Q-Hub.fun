import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ZMAX, toPx } from '../../lib/mapGeo';
import { baseMap, esc, loadMapData, pinIcon } from '../../lib/mapMarks';

/* міні-мапа пропозиції мітки в черзі модерації (specs/043 US5): запропонована точка — яскравим кружком,
   навколо — наявні мітки тієї самої категорії, щоб одразу побачити дубль. Дані — ті самі, що на великій мапі */
export default function PointPreview({ x, y, category }: { x: number; y: number; category?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = box.current; if (!el) return;
    let made: ReturnType<typeof baseMap>;
    try { made = baseMap(el, { scrollWheelZoom: true, zoomControl: true }); } catch { setFailed(true); return; }
    const { m } = made;
    const at = m.unproject(toPx(x, y), ZMAX);
    m.setView(at, 5, { animate: false });
    let live = true;
    loadMapData().then(d => {
      if (!live || !d) return;
      const cat = d.cats.find(c => c.id === category);
      let close = 0;
      for (const mk of d.marks) {
        if (mk.category !== category || !cat) continue;
        const dist = Math.hypot(mk.x - x, mk.y - y);
        if (dist < 150) close++;
        L.marker(m.unproject(toPx(mk.x, mk.y), ZMAX), { icon: pinIcon(cat, mk.icon), title: mk.name || cat.name, keyboard: false })
          .bindTooltip(`${esc(mk.name || cat.name)} · ${Math.round(dist)} м`).addTo(m);
      }
      setNear(close);
    });
    /* запропонована точка — поверх усього */
    /* окремий шар над значками міток (markerPane — 600), інакше наявні мітки перекрили б точку */
    m.createPane('proposed').style.zIndex = '650';
    L.circleMarker(at, { pane: 'proposed', radius: 11, color: '#fff', weight: 3, fillColor: '#ff6a1f', fillOpacity: 1 }).bindTooltip('Запропонована точка').addTo(m);
    return () => { live = false; m.remove(); };
  }, [x, y, category]);

  if (failed) return null;
  return (
    <div className="wpoint">
      <div ref={box} className="wpoint-map" role="img" aria-label={`Запропонована точка на мапі: X ${Math.round(x)}, Y ${Math.round(y)}`} />
      {near !== null && <small className={near ? 'warn' : 'muted'}>
        {near ? `Поруч (до 150 м) уже ${near} ${near === 1 ? 'мітка' : 'мітки'} цієї категорії — перевір, чи це не дубль.` : 'Поруч міток цієї категорії немає.'}
      </small>}
    </div>
  );
}
