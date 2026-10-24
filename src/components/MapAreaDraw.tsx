import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ringProblem, type MapArea, type MapCategory } from '../lib/mapData';
import Select from './Select';

/* малювання зони адміном: «Нова зона» → кліки по мапі вздовж межі → «Зберегти зону» (specs/002-map-areas).
   Самі кліки ловить мапа (MapPage), тут — категорія, назва й кнопки */
export default function MapAreaDraw({ cats, ring, drawing, onDraw, onUndo, onClear, onAdded }: {
  cats: MapCategory[]; ring: [number, number][]; drawing: boolean;
  onDraw: (on: boolean) => void; onUndo: () => void; onClear: () => void; onAdded: (a: MapArea) => void;
}) {
  const own = cats.filter(c => !c.builtin);
  const [cat, setCat] = useState('treasure-fields');
  useEffect(() => { if (!own.some(c => c.id === cat) && own.length) setCat(own[0].id); }, [own.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [name, setName] = useState(''); const [note, setNote] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  async function save() {
    const bad = ringProblem(ring); if (bad) return setMsg(bad);
    if (!cat) return setMsg('Вибери категорію.');
    setBusy(true); setMsg('');
    const r = ring.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number]);
    const { data, error } = await supabase!.from('map_areas').insert({ category_id: cat, name: name.trim(), note: note.trim(), ring: r }).select('id').single();
    setBusy(false);
    if (error) return setMsg(/relation .*map_areas|schema cache/i.test(error.message) ? 'У базі ще немає таблиці зон — запусти міграцію 0021_map_areas.sql у Supabase → SQL Editor.' : /row-level|permission/i.test(error.message) ? 'Це може лише адмін.' : error.message);
    onAdded({ id: 'area-' + data.id, dbId: data.id as number, category: cat, name: name.trim(), note: note.trim(), ring: r });
    setName(''); setNote(''); setMsg(`Зону збережено (${r.length} точок).`);
  }

  return (
    <section className="madmin" aria-label="Нова зона">
      <h4>Нова зона</h4>
      <p className="muted">Напр. поле скарбів: клікай по мапі точки вздовж межі по черзі — контур замкнеться сам.</p>
      <Select label="Категорія зони" value={cat} onChange={setCat} searchable options={own.map(c => ({ value: c.id, label: c.name, hint: c.grp }))} placeholder="Категорія" />
      <input className="min" placeholder="Назва (напр. Пляж аеропорту)" value={name} onChange={e => setName(e.target.value)} aria-label="Назва зони" maxLength={160} />
      <input className="min" placeholder="Примітка (необов'язково)" value={note} onChange={e => setNote(e.target.value)} aria-label="Примітка до зони" maxLength={600} />
      <div className="mrow">
        <button type="button" className={'btn sm' + (drawing ? ' acc' : ' ghost')} aria-pressed={drawing} onClick={() => { setMsg(''); onDraw(!drawing); }}>
          {drawing ? `Малюю… точок: ${ring.length}` : ring.length ? 'Продовжити малювати' : 'Малювати на мапі'}</button>
        <button type="button" className="btn sm ghost" disabled={!ring.length} onClick={onUndo}>Прибрати останню</button>
      </div>
      <div className="mrow">
        <button type="button" className="btn sm ghost" disabled={!ring.length && !drawing} onClick={() => { onDraw(false); onClear(); setMsg(''); }}>Скасувати</button>
        <button type="button" className="btn sm acc" disabled={busy || ring.length < 3} onClick={save}>Зберегти зону</button>
      </div>
      {msg && <p className="mmsg" role="status">{msg}</p>}
    </section>
  );
}
