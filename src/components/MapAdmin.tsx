import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseBulk, slugify, type MapCategory, type MapMark } from '../lib/mapData';
import { MAP_ICONS } from '../data/mapIcons';
import { fromQuantFun } from '../lib/mapGeo';
import Select from './Select';
import PicUpload from './PicUpload';

const dbErr = (m: string) => /owner_static|column .* does not exist/i.test(m)
  ? 'У базі стара версія таблиць мапи. Запусти оновлений q-hub-map.sql у Supabase → SQL Editor ще раз.'
  : /relation .*map_(points|categories)|schema cache/i.test(m)
  ? 'У базі ще немає таблиць мапи. Запусти q-hub-map.sql у Supabase → SQL Editor.'
  : /row-level security|permission/i.test(m) ? 'Це може лише адмін.' : m;

/* інструменти адміна на мапі: нова мітка (координати вписати або взяти кліком), багато міток рядками, нова категорія */
export default function MapAdmin({ cats, picked, picking, onPick, onMarks, onCat }: {
  cats: MapCategory[]; picked: [number, number] | null; picking: boolean; onPick: (on: boolean) => void;
  onMarks: (m: MapMark[]) => void; onCat: (c: MapCategory) => void;
}) {
  const own = cats.filter(c => !c.builtin);
  const [cat, setCat] = useState(own[0]?.id || '');
  /* категорії з бази приходять уже після відкриття форми — тоді вибираємо першу */
  useEffect(() => { if (!cat && own.length) setCat(own[0].id); }, [own.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [name, setName] = useState(''); const [note, setNote] = useState(''); const [owner, setOwner] = useState('');
  const [x, setX] = useState(''); const [y, setY] = useState('');
  const [bulk, setBulk] = useState('');
  /* звідки координати: з гри (як у нас) чи пікселі з мапи QuantFun — тоді переводимо самі */
  const [src, setSrc] = useState<'game' | 'qf'>('game');
  const conv = src === 'qf' ? fromQuantFun : undefined;
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [cName, setCName] = useState(''); const [cGrp, setCGrp] = useState('Міні-ігри, квести й контракти');
  const [cColor, setCColor] = useState('#ff6a1f'); const [cIcon, setCIcon] = useState(MAP_ICONS[0]);
  const groups = [...new Set(cats.map(c => c.grp))];
  /* координати, взяті кліком по мапі, підставляються у форму */
  const [seen, setSeen] = useState<[number, number] | null>(null);
  if (picked && picked !== seen) { setSeen(picked); setX(String(Math.round(picked[0] * 10) / 10)); setY(String(Math.round(picked[1] * 10) / 10)); }

  const toMark = (r: { id: number; category_id: string; name: string; note: string; x: number; y: number; owner_static: number | null }): MapMark =>
    ({ id: 'db-' + r.id, dbId: r.id, category: r.category_id, name: r.name, note: r.note, x: r.x, y: r.y, owner: r.owner_static });

  async function insert(rows: { category_id: string; name: string; note: string; x: number; y: number; owner_static?: number | null }[]) {
    setBusy(true); setMsg('');
    const { data, error } = await supabase!.from('map_points').insert(rows).select('id,category_id,name,note,x,y,owner_static');
    setBusy(false);
    if (error) { setMsg(dbErr(error.message)); return false; }
    onMarks((data || []).map(toMark)); setMsg(`Додано міток: ${data?.length || 0}`); return true;
  }
  async function addOne() {
    const x0 = parseFloat(x.replace(',', '.')), y0 = parseFloat(y.replace(',', '.'));
    if (!cat) return setMsg('Вибери категорію.');
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return setMsg('Впиши X і Y або візьми їх кліком по мапі.');
    const [xv, yv] = conv ? conv(x0, y0) : [x0, y0];
    if (xv < -6000 || xv > 6800 || yv < -4400 || yv > 8500) return setMsg(`Точка X ${xv}, Y ${yv} поза мапою — перевір, чи правильно вибрано «${src === 'qf' ? 'QuantFun' : 'З гри'}».`);
    const st = owner.trim() ? Number(owner.trim().replace('#', '')) : null;
    if (st !== null && !(Number.isInteger(st) && st > 0)) return setMsg('Статік власника — ціле число, напр. 12345.');
    if (await insert([{ category_id: cat, name: name.trim(), note: note.trim(), x: xv, y: yv, owner_static: st }])) { setName(''); setNote(''); setOwner(''); if (conv) { setX(''); setY(''); } }
  }
  async function addBulk() {
    if (!cat) return setMsg('Вибери категорію.');
    const r = parseBulk(bulk, conv);
    if (r.bad.length) return setMsg(`Не зрозумів рядки: ${r.bad.join(', ')}. Формат: X, Y, назва (назву можна не писати).`);
    if (!r.ok.length) return setMsg('Немає жодного рядка з координатами.');
    if (await insert(r.ok.map(p => ({ category_id: cat, name: p.name, note: '', x: p.x, y: p.y })))) setBulk('');
  }
  async function addCat() {
    const n = cName.trim(); if (!n) return setMsg('Впиши назву категорії.');
    let id = slugify(n); if (cats.some(c => c.id === id)) id = id.slice(0, 34) + '-' + Date.now().toString(36).slice(-5);
    const row = { id, name: n, grp: cGrp.trim() || 'Інше', icon: cIcon, color: cColor, sort: 200 + cats.length, shown: true };
    setBusy(true); setMsg('');
    const { error } = await supabase!.from('map_categories').insert(row);
    setBusy(false);
    if (error) return setMsg(dbErr(error.message));
    onCat(row); setCat(id); setCName(''); setMsg(`Категорію «${n}» створено — додай у неї мітки.`);
  }

  return (
    <details className="madmin" open>
      <summary>Інструменти адміна</summary>
      <section>
        <h4>Нова мітка</h4>
        <Select label="Категорія" value={cat} onChange={setCat} searchable options={own.map(c => ({ value: c.id, label: c.name, hint: c.grp }))} placeholder="Категорія" />
        <input className="min" placeholder="Назва (необов'язково)" value={name} onChange={e => setName(e.target.value)} aria-label="Назва мітки" />
        <input className="min" placeholder="Примітка (необов'язково)" value={note} onChange={e => setNote(e.target.value)} aria-label="Примітка" />
        <input className="min mono" inputMode="numeric" placeholder="Статік власника бізнесу (необов'язково)" value={owner} onChange={e => setOwner(e.target.value)} aria-label="Статік власника" />
        <div className="mseg" role="radiogroup" aria-label="Звідки координати">
          <button type="button" role="radio" aria-checked={src === 'game'} onClick={() => setSrc('game')}>З гри / Q-Hub</button>
          <button type="button" role="radio" aria-checked={src === 'qf'} onClick={() => setSrc('qf')}>Пікселі QuantFun</button>
        </div>
        {src === 'qf' && <p className="muted">Впиши числа з мапи QuantFun як є — переведу в координати гри сам (похибка ~3 м). Для «Взяти з мапи» перемкни назад на «З гри».</p>}
        <div className="mrow">
          <input className="min mono" inputMode="decimal" placeholder="X" value={x} onChange={e => setX(e.target.value)} aria-label="X" />
          <input className="min mono" inputMode="decimal" placeholder="Y" value={y} onChange={e => setY(e.target.value)} aria-label="Y" />
        </div>
        <div className="mrow">
          <button type="button" className={'btn sm' + (picking ? ' acc' : ' ghost')} onClick={() => { setSrc('game'); onPick(!picking); }} aria-pressed={picking}>{picking ? 'Клікни на мапі…' : 'Взяти з мапи'}</button>
          <button type="button" className="btn sm acc" disabled={busy} onClick={addOne}>Додати мітку</button>
        </div>
      </section>
      <section>
        <h4>Багато міток одразу</h4>
        <p className="muted">У вибрану вище категорію{src === 'qf' ? ', пікселі QuantFun' : ''}. Кожен рядок: <span className="mono">X, Y, назва</span></p>
        <textarea className="min mono" rows={4} placeholder={'-1600, -1000, Бак біля пірсу\n120.5, -830'} value={bulk} onChange={e => setBulk(e.target.value)} aria-label="Мітки рядками" />
        <button type="button" className="btn sm acc" disabled={busy || !bulk.trim()} onClick={addBulk}>Додати {parseBulk(bulk, conv).ok.length || ''} міток</button>
      </section>
      <section>
        <h4>Нова категорія</h4>
        <input className="min" placeholder="Назва, напр. Сміттєві баки" value={cName} onChange={e => setCName(e.target.value)} aria-label="Назва категорії" />
        <input className="min" list="map-groups" placeholder="Група" value={cGrp} onChange={e => setCGrp(e.target.value)} aria-label="Група" />
        <datalist id="map-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
        <label className="mrow mcolor">Колір обводки <input type="color" value={cColor} onChange={e => setCColor(e.target.value)} /></label>
        <div className="micons" role="radiogroup" aria-label="Іконка">{MAP_ICONS.map(src => (
          <button type="button" key={src} role="radio" aria-checked={cIcon === src} className={cIcon === src ? 'on' : ''} onClick={() => setCIcon(src)}><img src={src} alt="" width={26} height={26} loading="lazy" /></button>
        ))}</div>
        <div className="mrow"><span className="muted">або своя:</span>
          <PicUpload label="Своя іконка категорії" path={`map/${slugify(cName || 'icon')}-${Date.now().toString(36)}.webp`} frame={{ w: 128, h: 128 }} onDone={async url => { setCIcon(url); }} />
          {!MAP_ICONS.includes(cIcon) && <img src={cIcon} alt="Своя іконка" width={26} height={26} />}</div>
        <button type="button" className="btn sm acc" disabled={busy} onClick={addCat}>Створити категорію</button>
      </section>
      {msg && <p className="mmsg" role="status">{msg}</p>}
    </details>
  );
}
