import { useEffect, useState } from 'react';
import Icon from './Icon';
import type { MapArea, MapCategory, MapMark } from '../lib/mapData';

/* «Скрін мапи»: уся мапа з мітками, які зараз увімкнені у фільтрах, — картинкою PNG (для Discord, Telegram) або SVG */
const SIZES: [number, string][] = [[12, 'дрібні'], [20, 'звичайні'], [32, 'великі']];

export default function MapShot({ marks, areas, catById, isOn }: { marks: MapMark[]; areas: MapArea[]; catById: Record<string, MapCategory>; isOn: (c: MapCategory) => boolean }) {
  const [pinPx, setPinPx] = useState(20);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [shot, setShot] = useState<{ png: string; svg: string; w: number; h: number; kb: number } | null>(null);
  const picked = marks.filter(m => catById[m.category] && isOn(catById[m.category]));
  const pickedAreas = areas.filter(a => catById[a.category] && isOn(catById[a.category]));
  /* старі адреси картинок звільняємо, коли знімок замінено чи вікно закрито */
  useEffect(() => () => { if (shot) { URL.revokeObjectURL(shot.png); URL.revokeObjectURL(shot.svg); } }, [shot]);

  async function make() {
    setErr(''); setBusy('Готую…');
    try {
      const { mapShot } = await import('../lib/gameMap');
      const pins = picked.map(m => { const c = catById[m.category]; return { x: m.x, y: m.y, icon: m.icon || c.icon, color: c.color, name: m.name || c.name }; });
      const layers = (['names', 'zones'] as const).filter(id => catById[id] && isOn(catById[id]));
      const r = await mapShot(pins, { pinPx, layers, areas: pickedAreas.map(a => ({ ring: a.ring, color: catById[a.category].color })) }, setBusy);
      setShot({ png: URL.createObjectURL(r.png), svg: URL.createObjectURL(r.svg), w: r.w, h: r.h, kb: Math.round(r.png.size / 1024) });
    } catch (e) { setErr('Не вдалося зробити скрін: ' + (e as Error).message); }
    setBusy('');
  }
  const save = (href: string, name: string) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.append(a); a.click(); a.remove(); };
  const day = new Date().toISOString().slice(0, 10);

  return (
    <div className="mshot">
      <p className="muted">Знімок усієї мапи з мітками, які зараз увімкнені у фільтрах. Щоб змінити, що на ньому, — закрий вікно й увімкни чи вимкни групи міток.</p>
      <p className="mshot-n"><b>{picked.length}</b> міток{pickedAreas.length ? <> · <b>{pickedAreas.length}</b> зон</> : null}</p>
      <div className="mseg" role="group" aria-label="Розмір міток">
        {SIZES.map(([v, l]) => <button key={v} type="button" aria-pressed={pinPx === v} onClick={() => { setPinPx(v); setShot(null); }}>{l} · {v} px</button>)}
      </div>
      {!shot && <button type="button" className="btn acc" disabled={!!busy} onClick={make}><Icon name="camera" size={18} />{busy || 'Зробити скрін'}</button>}
      {picked.length === 0 && !shot && <p className="muted">Жодна мітка не увімкнена — на знімку буде лише мапа.</p>}
      {shot && <>
        <a className="mshot-prev" href={shot.png} target="_blank" rel="noopener noreferrer" title="Відкрити в повному розмірі">
          <img src={shot.png} alt={`Мапа штату з ${picked.length} мітками`} width={shot.w} height={shot.h} />
        </a>
        <div className="row">
          <button type="button" className="btn acc" onClick={() => save(shot.png, `q-hub-mapa-${day}.png`)}><Icon name="download" size={18} />PNG · {shot.kb > 1024 ? (shot.kb / 1024).toFixed(1) + ' МБ' : shot.kb + ' КБ'}</button>
          <button type="button" className="btn ghost" onClick={() => save(shot.svg, `q-hub-mapa-${day}.svg`)}><Icon name="download" size={18} />SVG</button>
          <button type="button" className="btn ghost" onClick={() => setShot(null)}>Ще раз</button>
        </div>
        <small className="muted">{shot.w}×{shot.h} px. PNG — щоб кинути в Discord чи Telegram; SVG — мітки чіткі при будь-якому збільшенні, але месенджери не показують його картинкою.</small>
      </>}
      {err && <p className="mmsg" role="alert">{err}</p>}
    </div>
  );
}
