import { useState } from 'react';
import type { MapCategory, MapMark } from '../lib/mapData';

/* «Карта для гри»: гравець галочками вибирає мітки, сайт збирає zip у форматі Hydra (вектор мінікарти + значки + 6 текстур) */
export default function GameMapExport({ groups, marks, catById, isOn }: {
  groups: { grp: string; cats: MapCategory[] }[]; marks: MapMark[]; catById: Record<string, MapCategory>; isOn: (c: MapCategory) => boolean;
}) {
  /* поки галочку не чіпали — як у фільтрі мапи (категорії з бази приходять уже після відкриття сторінки) */
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const on = (c: MapCategory) => sel[c.id] ?? isOn(c);
  const [iconM, setIconM] = useState(12);
  const [tex, setTex] = useState(512);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const count: Record<string, number> = {}; for (const m of marks) count[m.category] = (count[m.category] || 0) + 1;
  const all = groups.flatMap(g => g.cats);
  const picked = marks.filter(m => catById[m.category] && on(catById[m.category]));
  const set = (ids: string[], v: boolean) => setSel(s => { const n = { ...s }; for (const id of ids) n[id] = v; return n; });

  async function go() {
    setErr(''); setBusy('Готую…');
    try {
      const { buildGamePack } = await import('../lib/gameMap');
      const pins = picked.map(m => { const c = catById[m.category]; return { x: m.x, y: m.y, icon: m.icon || c.icon, color: c.color }; });
      const blob = await buildGamePack(pins, { iconM, texSize: tex, texPin: Math.round(14 * tex / 512) }, setBusy);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'q-hub-minimap.zip';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch (e) { setErr('Не вдалося зібрати архів: ' + (e as Error).message); }
    setBusy('');
  }

  return (
    <details className="madmin mgame">
      <summary>Карта для гри</summary>
      <p className="muted">Наша мапа для заміни мінікарти в GTA V через OpenIV — ті самі файли, що дає Hydra. Галочками вибери мітки: вони стануть значками прямо на мапі.</p>
      <div className="mseg" role="group" aria-label="Усі мітки">
        <button type="button" onClick={() => set(all.map(c => c.id), true)}>Усі</button>
        <button type="button" onClick={() => set(all.map(c => c.id), false)}>Жодної</button>
      </div>
      {groups.map(({ grp, cats }) => (
        <fieldset key={grp} className="mgame-grp">
          <legend>{grp}</legend>
          {cats.map(c => (
            <label key={c.id} className="mcheck">
              <input type="checkbox" checked={on(c)} onChange={e => set([c.id], e.target.checked)} />
              <img src={c.icon} alt="" width={18} height={18} loading="lazy" />{c.name}<span className="cnt">{count[c.id] || 0}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <div className="mrow">
        <label className="mcheck">Значок, м <select className="min" value={iconM} onChange={e => setIconM(+e.target.value)}>{[8, 12, 20, 30].map(v => <option key={v} value={v}>{v}{v === 12 ? ' (як у Hydra)' : ''}</option>)}</select></label>
        <label className="mcheck">Текстури <select className="min" value={tex} onChange={e => setTex(+e.target.value)}>{[512, 1024, 2048].map(v => <option key={v} value={v}>{v}{v === 512 ? ' (як у Hydra)' : ''}</option>)}</select></label>
      </div>
      <button type="button" className="btn sm acc" disabled={!!busy} onClick={go}>{busy || `Скачати карту для гри · ${picked.length} міток`}</button>
      {picked.length > 1500 && !busy && <p className="muted">Багато міток — значки на мінікарті злипатимуться, а архів буде великим.</p>}
      {err && <p className="mmsg" role="alert">{err}</p>}
    </details>
  );
}
