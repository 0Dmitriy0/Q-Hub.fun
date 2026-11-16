import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ringProblem, type MapArea, type MapCategory } from '../lib/mapData';
import Select from './Select';
import { asset } from '../lib/app';
import { ANIMALS, HUNT_CATEGORY, sortAnimals, type AnimalId } from '../lib/huntAnimals';

/* звірі поля полювання (specs/088): 8 перемикачів з іконкою й назвою */
function AnimalPicker({ value, onChange }: { value: AnimalId[]; onChange: (v: AnimalId[]) => void }) {
  return (
    <div className="manimal-pick" role="group" aria-label="Звірі на полі">
      <span className="muted">Звірі на полі</span>
      {ANIMALS.map(a => { const on = value.includes(a.id); return (
        <button key={a.id} type="button" className={'btn sm' + (on ? ' acc' : ' ghost')} aria-pressed={on}
          onClick={() => onChange(sortAnimals(on ? value.filter(x => x !== a.id) : [...value, a.id]))}>
          <img src={asset(a.icon)} alt="" width={18} height={18} />{a.name}</button>); })}
    </div>
  );
}
const noAnimalsCol = (m: string) => /animals/i.test(m) && /column|schema cache/i.test(m);
const NO_AT = 'У базі ще немає місця звірів — запусти міграцію 0074_map_area_animals_at.sql у Supabase → SQL Editor.';
const NO_COL = 'У базі ще немає звірів у зонах — запусти міграцію 0069_map_area_animals.sql у Supabase → SQL Editor.';

/* малювання зони адміном: «Нова зона» → кліки по мапі вздовж межі → «Зберегти зону» (specs/002-map-areas).
   Самі кліки ловить мапа (MapPage), тут — категорія, назва й кнопки */
export default function MapAreaDraw({ cats, ring, drawing, onDraw, onUndo, onClear, onAdded }: {
  cats: MapCategory[]; ring: [number, number][]; drawing: boolean;
  onDraw: (on: boolean) => void; onUndo: () => void; onClear: () => void; onAdded: (a: MapArea) => void;
}) {
  const own = cats.filter(c => !c.builtin);
  const [cat, setCat] = useState('treasure-fields');
  useEffect(() => { if (!own.some(c => c.id === cat) && own.length) setCat(own[0].id); }, [own.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [name, setName] = useState(''); const [note, setNote] = useState(''); const [animals, setAnimals] = useState<AnimalId[]>([]);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const hunt = cat === HUNT_CATEGORY;

  async function save() {
    const bad = ringProblem(ring); if (bad) return setMsg(bad);
    if (!cat) return setMsg('Вибери категорію.');
    setBusy(true); setMsg('');
    const r = ring.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number]);
    const { data, error } = await supabase!.from('map_areas').insert({ category_id: cat, name: name.trim(), note: note.trim(), ring: r, ...(hunt ? { animals } : {}) }).select('id').single();
    setBusy(false);
    if (error) return setMsg(noAnimalsCol(error.message) ? NO_COL : /relation .*map_areas|schema cache/i.test(error.message) ? 'У базі ще немає таблиці зон — запусти міграцію 0021_map_areas.sql у Supabase → SQL Editor.' : /row-level|permission/i.test(error.message) ? 'Це може лише адмін.' : error.message);
    onAdded({ id: 'area-' + data.id, dbId: data.id as number, category: cat, name: name.trim(), note: note.trim(), ring: r, animals: hunt ? animals : [] });
    setName(''); setNote(''); setAnimals([]); setMsg(`Зону збережено (${r.length} точок).`);
  }

  return (
    <section className="madmin" aria-label="Нова зона">
      <h4>Нова зона</h4>
      <p className="muted">Напр. поле скарбів: клікай по мапі точки вздовж межі по черзі — контур замкнеться сам.</p>
      <Select label="Категорія зони" value={cat} onChange={setCat} searchable options={own.map(c => ({ value: c.id, label: c.name, hint: c.grp }))} placeholder="Категорія" />
      <input className="min" placeholder="Назва (напр. Пляж аеропорту)" value={name} onChange={e => setName(e.target.value)} aria-label="Назва зони" maxLength={160} />
      <input className="min" placeholder="Примітка (необов'язково)" value={note} onChange={e => setNote(e.target.value)} aria-label="Примітка до зони" maxLength={600} />
      {hunt && <AnimalPicker value={animals} onChange={setAnimals} />}
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

/* зміна зони адміном: назва, примітка, категорія й контур. Контур правлять на мапі (MapPage): тягнути точки,
   середини ребер (нова точка), подвійний клік — прибрати точку, ручка в центрі — перенести всю зону */
export function MapAreaEdit({ area, cats, ring, zooAt, onZooAuto, onReset, onCancel, onDone }: {
  area: MapArea; cats: MapCategory[]; ring: [number, number][]; zooAt: [number, number] | null; onZooAuto: () => void;
  onReset: () => void; onCancel: () => void; onDone: (a: MapArea) => void;
}) {
  const own = cats.filter(c => !c.builtin);
  const [cat, setCat] = useState(area.category);
  const [name, setName] = useState(area.name); const [note, setNote] = useState(area.note);
  const [animals, setAnimals] = useState<AnimalId[]>(area.animals);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const moved = ring !== area.ring;
  const hunt = cat === HUNT_CATEGORY;

  async function save() {
    const bad = ringProblem(ring); if (bad) return setMsg(bad);
    setBusy(true); setMsg('');
    const r = ring.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number]);
    /* звірів шлемо лише для поля полювання — інші зони зберігаються й до міграції 0069 */
    /* місце звірів шлемо, лише коли його чіпали — решта правок зберігається й до міграції 0074 */
    const at = hunt && animals.length ? zooAt : null, atSet = (at?.join() ?? '') !== (area.animalsAt?.join() ?? '');
    const { error } = await supabase!.from('map_areas').update({ category_id: cat, name: name.trim(), note: note.trim(), ring: r, ...(hunt ? { animals } : {}), ...(atSet ? { animals_at: at } : {}) }).eq('id', area.dbId);
    setBusy(false);
    if (error) return setMsg(/animals_at/i.test(error.message) && /column|schema cache/i.test(error.message) ? NO_AT : noAnimalsCol(error.message) ? NO_COL : /row-level|permission/i.test(error.message) ? 'Це може лише адмін.' : error.message);
    onDone({ ...area, category: cat, name: name.trim(), note: note.trim(), ring: r, ...(hunt ? { animals } : {}), animalsAt: at });
  }

  return (
    <section className="madmin medit-box" aria-label="Змінити зону">
      <h4>Змінити зону{area.name ? ` «${area.name}»` : ''}</h4>
      <p className="muted">На мапі: тягни білі точки межі, ручку в центрі — щоб перенести всю зону. Потягни середину ребра — буде нова точка, подвійний клік по точці — прибрати її.</p>
      <input className="min" placeholder="Назва" value={name} onChange={e => setName(e.target.value)} aria-label="Назва зони" maxLength={160} />
      <input className="min" placeholder="Примітка (необов'язково)" value={note} onChange={e => setNote(e.target.value)} aria-label="Примітка до зони" maxLength={600} />
      <Select label="Категорія зони" value={cat} onChange={setCat} searchable options={own.map(c => ({ value: c.id, label: c.name, hint: c.grp }))} placeholder="Категорія" />
      {hunt && <AnimalPicker value={animals} onChange={setAnimals} />}
      {hunt && area.animals.length > 0 && <div className="mrow">
        <span className="muted">Звірі: тягни плашку на мапі. Кружки — значки на мапі для гри.</span>
        <button type="button" className="btn sm ghost" disabled={!zooAt} onClick={onZooAuto}>Місце звірів — само</button>
      </div>}
      <div className="mrow">
        <button type="button" className="btn sm ghost" disabled={!moved} onClick={onReset}>Повернути контур</button>
        <span className="muted mono">точок: {ring.length}</span>
      </div>
      <div className="mrow">
        <button type="button" className="btn sm ghost" onClick={onCancel}>Скасувати</button>
        <button type="button" className="btn sm acc" disabled={busy} onClick={save}>Зберегти зону</button>
      </div>
      {msg && <p className="mmsg" role="status">{msg}</p>}
    </section>
  );
}
