import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseBulk, slugify, type MapCategory, type MapMark } from '../lib/mapData';
import { MAP_ICONS } from '../data/mapIcons';
import { fromQuantFun } from '../lib/mapGeo';
import Select from './Select';
import PicUpload from './PicUpload';

export const dbErr = (m: string) => /owner_static|icon|column .* does not exist/i.test(m)
  ? 'У базі стара версія таблиць мапи. Запусти оновлений q-hub-map.sql у Supabase → SQL Editor ще раз.'
  : /relation .*map_(points|categories)|schema cache/i.test(m)
  ? 'У базі ще немає таблиць мапи. Запусти q-hub-map.sql у Supabase → SQL Editor.'
  : /row-level security|permission/i.test(m) ? 'Це може лише адмін.' : m;

const colErr = (m: string) => /show_label/i.test(m) ? 'У базі ще немає колонки для підпису мітки. Запусти q-hub-map-label.sql у Supabase → SQL Editor.'
  : /icon/i.test(m) ? 'У базі ще немає колонки для іконки мітки. Запусти q-hub-map-icon.sql у Supabase → SQL Editor.' : dbErr(m);

/* сітка готових іконок; null — «як у категорії» */
export function IconGrid({ value, onChange, catIcon, label }: { value: string | null; onChange: (v: string | null) => void; catIcon?: string; label: string }) {
  return (
    <div className="micons" role="radiogroup" aria-label={label}>
      {catIcon !== undefined && <button type="button" role="radio" aria-checked={value === null} className={'mcat-ico' + (value === null ? ' on' : '')} onClick={() => onChange(null)} title="Як у категорії">
        {catIcon ? <img src={catIcon} alt="" width={22} height={22} /> : null}<small>кат.</small></button>}
      {MAP_ICONS.map(src => (
        <button type="button" key={src} role="radio" aria-checked={value === src} className={value === src ? 'on' : ''} onClick={() => onChange(src)}><img src={src} alt="" width={26} height={26} loading="lazy" /></button>
      ))}
    </div>
  );
}

/* редагування мітки: інша категорія і/або своя іконка */
export function MarkEdit({ mark, cats, onDone, onCancel }: { mark: MapMark; cats: MapCategory[]; onDone: (m: MapMark) => void; onCancel: () => void }) {
  const own = cats.filter(c => !c.builtin);
  const [cat, setCat] = useState(mark.category); const [icon, setIcon] = useState<string | null>(mark.icon || null);
  const [name, setName] = useState(mark.name); const [note, setNote] = useState(mark.note);
  const [label, setLabel] = useState(mark.label !== false);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const catIcon = cats.find(c => c.id === cat)?.icon || '';
  async function save() {
    setBusy(true); setMsg('');
    const { error } = await supabase!.from('map_points').update({ category_id: cat, icon, name: name.trim(), note: note.trim(), ...(label !== (mark.label !== false) ? { show_label: label } : {}) }).eq('id', mark.dbId!);
    setBusy(false);
    if (error) return setMsg(colErr(error.message));
    onDone({ ...mark, category: cat, icon: icon || undefined, name: name.trim(), note: note.trim(), label });
  }
  return (
    <section className="madmin medit-box" aria-label="Змінити мітку">
      <h4>Змінити мітку{mark.name ? ` «${mark.name}»` : ''}</h4>
      <input className="min" placeholder="Назва (видно під міткою на мапі)" value={name} onChange={e => setName(e.target.value)} aria-label="Назва мітки" maxLength={160} />
      <label className="mcheck"><input type="checkbox" checked={label} onChange={e => setLabel(e.target.checked)} /> Показувати назву на мапі</label>
      <input className="min" placeholder="Примітка (необов'язково)" value={note} onChange={e => setNote(e.target.value)} aria-label="Примітка" maxLength={600} />
      <Select label="Категорія" value={cat} onChange={setCat} searchable options={own.map(c => ({ value: c.id, label: c.name, hint: c.grp }))} placeholder="Категорія" />
      <p className="muted">Іконка: перша — як у категорії, або будь-яка інша лише для цієї мітки</p>
      <IconGrid value={icon} onChange={setIcon} catIcon={catIcon} label="Іконка мітки" />
      <div className="mrow">
        <button type="button" className="btn sm ghost" onClick={onCancel}>Скасувати</button>
        <button type="button" className="btn sm acc" disabled={busy} onClick={save}>Зберегти</button>
      </div>
      {msg && <p className="mmsg" role="status">{msg}</p>}
    </section>
  );
}

/* зміна категорії цілком: назва, група, колір обводки й іконка — одразу для всіх її міток.
   Вбудовані категорії (назви, зелені зони, роботи, скупники) живуть у коді сайту, тож тут їх немає */
export function CatEdit({ cats, pick, onSaved }: { cats: MapCategory[]; pick?: string | null; onSaved: (c: MapCategory) => void }) {
  const own = cats.filter(c => !c.builtin);
  const [id, setId] = useState(pick && own.some(c => c.id === pick) ? pick : own[0]?.id || '');
  const cur = own.find(c => c.id === id);
  const [f, setF] = useState(() => cur ? { name: cur.name, grp: cur.grp, color: cur.color, icon: cur.icon } : null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const groups = [...new Set(cats.map(c => c.grp))];
  /* інша категорія у списку (або категорії підвантажились пізніше) — форма бере її значення */
  useEffect(() => { const c = own.find(x => x.id === id) || own[0]; if (c) { setId(c.id); setF({ name: c.name, grp: c.grp, color: c.color, icon: c.icon }); } setMsg(''); }, [id, own.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!own.length || !f || !cur) return null;
  async function save() {
    const name = f!.name.trim(), grp = f!.grp.trim() || 'Інше';
    if (!name) return setMsg('Впиши назву категорії.');
    if (!/^#[0-9a-f]{6}$/i.test(f!.color)) return setMsg('Колір — у форматі #ff6a1f.');
    setBusy(true); setMsg('');
    const { error } = await supabase!.from('map_categories').update({ name, grp, color: f!.color, icon: f!.icon }).eq('id', id);
    setBusy(false);
    if (error) return setMsg(dbErr(error.message));
    onSaved({ ...cur!, name, grp, color: f!.color, icon: f!.icon }); setMsg(`Категорію «${name}» збережено — мітки на мапі вже оновились.`);
  }
  return (
    <section className="madmin medit-box" aria-label="Змінити категорію">
      <h4>Змінити категорію</h4>
      <Select label="Яку категорію змінити" value={id} onChange={setId} searchable options={own.map(c => ({ value: c.id, label: c.name, hint: c.grp }))} placeholder="Категорія" />
      <div className="mcat-prev" aria-hidden="true"><span className="mpin" style={{ borderColor: f.color, boxShadow: `0 0 0 3px ${f.color}38` }}><img src={f.icon} alt="" width={24} height={24} /></span><b>{f.name || 'Назва'}</b><small>{f.grp}</small></div>
      <input className="min" placeholder="Назва категорії" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} aria-label="Назва категорії" maxLength={80} />
      <input className="min" list="map-groups-edit" placeholder="Група" value={f.grp} onChange={e => setF({ ...f, grp: e.target.value })} aria-label="Група" />
      <datalist id="map-groups-edit">{groups.map(g => <option key={g} value={g} />)}</datalist>
      <label className="mrow mcolor">Колір обводки <input type="color" value={f.color} onChange={e => setF({ ...f, color: e.target.value })} /></label>
      <IconGrid value={f.icon} onChange={v => v && setF({ ...f, icon: v })} label="Іконка категорії" />
      <div className="mrow"><span className="muted">або своя:</span>
        <PicUpload label="Своя іконка категорії" path={`map/${id}-${Date.now().toString(36)}.webp`} frame={{ w: 128, h: 128 }} onDone={async url => { setF(x => x && { ...x, icon: url }); }} /></div>
      <button type="button" className="btn sm acc" disabled={busy} onClick={save}>Зберегти категорію</button>
      {msg && <p className="mmsg" role="status">{msg}</p>}
    </section>
  );
}

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
  const [mIcon, setMIcon] = useState<string | null>(null); const [mLabel, setMLabel] = useState(true);
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

  const toMark = (r: { id: number; category_id: string; name: string; note: string; x: number; y: number; owner_static: number | null; icon?: string | null; show_label?: boolean }): MapMark =>
    ({ id: 'db-' + r.id, dbId: r.id, category: r.category_id, name: r.name, note: r.note, x: r.x, y: r.y, owner: r.owner_static, icon: r.icon || undefined, label: r.show_label !== false });

  async function insert(rows: { category_id: string; name: string; note: string; x: number; y: number; owner_static?: number | null; icon?: string; show_label?: boolean }[]) {
    setBusy(true); setMsg('');
    const { data, error } = await supabase!.from('map_points').insert(rows).select('*');
    setBusy(false);
    if (error) { setMsg(colErr(error.message)); return false; }
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
    if (await insert([{ category_id: cat, name: name.trim(), note: note.trim(), x: xv, y: yv, owner_static: st, ...(mIcon ? { icon: mIcon } : {}), ...(mLabel ? {} : { show_label: false }) }])) { setName(''); setNote(''); setOwner(''); if (conv) { setX(''); setY(''); } }
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
        <label className="mcheck"><input type="checkbox" checked={mLabel} onChange={e => setMLabel(e.target.checked)} /> Показувати назву на мапі</label>
        <input className="min" placeholder="Примітка (необов'язково)" value={note} onChange={e => setNote(e.target.value)} aria-label="Примітка" />
        <input className="min mono" inputMode="numeric" placeholder="Статік власника бізнесу (необов'язково)" value={owner} onChange={e => setOwner(e.target.value)} aria-label="Статік власника" />
        <details className="mic-pick"><summary>Іконка мітки: {mIcon ? <img src={mIcon} alt="своя" width={20} height={20} /> : 'як у категорії'}</summary>
          <IconGrid value={mIcon} onChange={setMIcon} catIcon={own.find(c => c.id === cat)?.icon || ''} label="Іконка нової мітки" /></details>
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
        <IconGrid value={cIcon} onChange={v => v && setCIcon(v)} label="Іконка категорії" />
        <div className="mrow"><span className="muted">або своя:</span>
          <PicUpload label="Своя іконка категорії" path={`map/${slugify(cName || 'icon')}-${Date.now().toString(36)}.webp`} frame={{ w: 128, h: 128 }} onDone={async url => { setCIcon(url); }} />
          {!MAP_ICONS.includes(cIcon) && <img src={cIcon} alt="Своя іконка" width={26} height={26} />}</div>
        <button type="button" className="btn sm acc" disabled={busy} onClick={addCat}>Створити категорію</button>
      </section>
      {msg && <p className="mmsg" role="status">{msg}</p>}
    </details>
  );
}
