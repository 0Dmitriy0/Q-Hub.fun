import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OCEAN, PX_PER_M, TILE, ZMAX } from '../lib/mapGeo';
import { baseMap } from '../lib/mapMarks';
import { namesLayer } from '../lib/mapVector';
import { GAME_BOUNDS, pinRadius } from '../lib/gamePreview';
import { recolor, type GameTheme } from '../lib/gameTheme';
import ZONES from '../data/mapZones.json';
import Icon from './Icon';

export type PreviewPin = { x: number; y: number; icon: string; color: string };
export type PreviewArea = { ring: [number, number][]; color: string };

/* міні-перегляд «Мапи для гри» (specs/026 US1): плитки й вектор мапи сайту в темі мапи для гри, назви й зелені зони —
   ті самі шари, поля — відтінком кольору категорії, мітки — кружок кольору категорії з іконкою, діаметром iconM метрів,
   як на мінікарті (drawPins у gameMap.ts). Мітки малюються на одному полотні поверх мапи: тисячі міток не гальмують галочки */
export default function GamePreview({ theme, names, zones, pins, areas, iconM, loading }: {
  theme: GameTheme; names: boolean; zones: boolean; pins: PreviewPin[]; areas: PreviewArea[]; iconM: number; loading: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ m: L.Map; ll: (x: number, y: number) => L.LatLng; retheme: () => void; names: L.LayerGroup; zones: L.LayerGroup; areas: L.LayerGroup; draw: () => void; home: () => void } | null>(null);
  const themeRef = useRef(theme);
  const data = useRef({ pins, iconM });
  const imgs = useRef(new Map<string, HTMLImageElement | null>());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = box.current; if (!el) return;
    let made: ReturnType<typeof baseMap>;
    try { made = baseMap(el, { zoomAnimation: false, minZoom: 0.5, zoomSnap: 0.25, wheelPxPerZoomLevel: 90 }, () => themeRef.current); }
    catch { setFailed(true); return; }
    const { m, ll, retheme } = made;
    const full = TILE * 2 ** ZMAX;
    const np = m.createPane('names'); np.style.zIndex = '450'; np.style.pointerEvents = 'none';
    const namesG = L.layerGroup().addTo(m);
    namesLayer(ZMAX, PX_PER_M, ZMAX + 2, L.latLngBounds(m.unproject([0, full], ZMAX), m.unproject([full, 0], ZMAX)), () => themeRef.current).addTo(namesG);
    const zonesG = L.layerGroup().addTo(m), areasG = L.layerGroup().addTo(m);
    for (const z of ZONES as number[][][][]) L.polygon(z.map(r => r.map(([x, y]) => ll(x, y))), { color: 'rgba(140, 230, 150, .7)', weight: 1, fillColor: 'rgb(60, 200, 90)', fillOpacity: 0.2, interactive: false }).addTo(zonesG);

    /* полотно міток — над мапою, у межах вікна перегляду; перемальовується на кожен рух (без анімації зуму — кадр завжди точний) */
    const cv = L.DomUtil.create('canvas', 'gprev-pins', m.getContainer());
    let raf = 0;
    const draw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const size = m.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = size.x * dpr; cv.height = size.y * dpr; cv.style.width = size.x + 'px'; cv.style.height = size.y + 'px';
        const ctx = cv.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const { pins: ps, iconM: im } = data.current, r = pinRadius(im, m.getZoom());
        for (const p of ps) {
          const pt = m.latLngToContainerPoint(ll(p.x, p.y));
          if (pt.x < -r || pt.y < -r || pt.x > size.x + r || pt.y > size.y + r) continue;
          ctx.beginPath();
          if (r < 2) { ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = '#111'; ctx.stroke(); continue; }
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
          ctx.lineWidth = Math.max(1, r / 6); ctx.strokeStyle = p.color; ctx.stroke();
          const ic = imgs.current.get(p.icon);
          if (ic && r >= 4) ctx.drawImage(ic, pt.x - r * 0.72, pt.y - r * 0.72, r * 1.44, r * 1.44);
          else if (ic === undefined && r >= 4) {   // іконку ще не вантажили — вантажимо й малюємо знову
            imgs.current.set(p.icon, null);
            const i = new Image(); i.onload = () => { imgs.current.set(p.icon, i); draw(); }; i.src = p.icon;
          }
        }
      });
    };
    m.on('move zoom resize', draw);
    const b = GAME_BOUNDS;
    const home = () => m.fitBounds(L.latLngBounds(ll(b.x0, b.yb), ll(b.x1, b.yt)), { animate: false, padding: [8, 8] });
    /* діалог відкривається з анімацією — розмір вікна перегляду стає відомим трохи пізніше */
    /* поки гравець сам не рухав перегляд, зміна розміру вікна знову вписує всю мапу */
    let moved = false; const touched = () => { moved = true; };
    for (const ev of ['pointerdown', 'wheel', 'keydown']) el.addEventListener(ev, touched, { passive: true });
    const ro = new ResizeObserver(() => { m.invalidateSize(); if (!moved) home(); draw(); });
    ro.observe(el);
    home();
    api.current = { m, ll, retheme, names: namesG, zones: zonesG, areas: areasG, draw, home };
    return () => { ro.disconnect(); cancelAnimationFrame(raf); m.remove(); api.current = null; };
  }, []);

  /* тема — плитки, вектор і назви перемальовуються в новій темі */
  useEffect(() => {
    if (themeRef.current === theme) return;
    themeRef.current = theme;
    const a = api.current; if (!a) return;
    a.retheme(); a.names.eachLayer(l => (l as L.GridLayer).redraw());
  }, [theme]);

  useEffect(() => {
    const a = api.current; if (!a) return;
    for (const [g, on] of [[a.names, names], [a.zones, zones]] as const) { if (on) g.addTo(a.m); else g.remove(); }
  }, [names, zones]);

  useEffect(() => {
    const a = api.current; if (!a) return;
    a.areas.clearLayers();
    for (const ar of areas) L.polygon(ar.ring.map(([x, y]) => a.ll(x, y)), { color: ar.color, opacity: 0.9, weight: 1.5, fillColor: ar.color, fillOpacity: 0.28, interactive: false }).addTo(a.areas);
  }, [areas]);

  useEffect(() => { data.current = { pins, iconM }; api.current?.draw(); }, [pins, iconM]);

  if (failed) return <div className="gprev gprev-off"><Icon name="map" size={22} /><p>Перегляд не вдалося показати в цьому браузері. Скачати мапу однаково можна.</p></div>;
  const zoom = (d: number) => api.current?.m.zoomIn(d);
  return (
    <div className="gprev" style={{ background: recolor(OCEAN, theme) }}>
      <div ref={box} className="gprev-map" style={{ background: recolor(OCEAN, theme) }} role="region" tabIndex={0} aria-label="Перегляд мапи для гри: колесо чи + і − наближають, перетягни, щоб рухати" />
      <div className="gprev-ctl">
        <button type="button" className="hud-b" onClick={() => zoom(1)} aria-label="Наблизити" title="Наблизити"><Icon name="plus" size={16} /></button>
        <button type="button" className="hud-b" onClick={() => zoom(-1)} aria-label="Віддалити" title="Віддалити"><Icon name="minus" size={16} /></button>
        <button type="button" className="hud-b" onClick={() => api.current?.home()} aria-label="Уся мапа" title="Уся мапа"><Icon name="layers" size={16} /></button>
      </div>
      {loading && <span className="gprev-load" role="status">Завантажую мітки…</span>}
    </div>
  );
}
