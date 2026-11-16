import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { labelFromRow, labelToRow, type MapLabel } from '../lib/mapLabel';
import { BOLD_STEPS, FONT_BY_ID, LABEL_FONTS, boldStep, fontFamily, loadLabelFont } from '../lib/labelFonts';
import Select from './Select';

/* новий напис у точці (x, y) — стиль за замовчуванням (specs/089) */
export const newLabel = (x: number, y: number): MapLabel => ({
  id: 'label-new', text: 'НАЗВА', x, y, color: '#f4f1ec', font: 'roboto-condensed', weight: 700, outlineColor: '#0d0d0d', outlineW: 3, angle: 0, size: 40,
});

/* форма напису адміна: текст, колір, шрифт, товщина, обводка, кут, розмір. Кожна зміна — одразу на мапі (onChange);
   перенести, повернути й змінити розмір можна й ручками на самій мапі (MapPage) */
export default function MapLabelEdit({ label, onChange, onCancel, onSaved }: {
  label: MapLabel; onChange: (l: MapLabel) => void; onCancel: () => void; onSaved: (l: MapLabel) => void;
}) {
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const set = (p: Partial<MapLabel>) => onChange({ ...label, ...p });
  const font = FONT_BY_ID[label.font] ?? LABEL_FONTS[0];
  const [fontOk, setFontOk] = useState(true);
  useEffect(() => { let on = true; loadLabelFont(label.font, label.weight).then(ok => { if (on) setFontOk(ok); }); return () => { on = false; }; }, [label.font, label.weight]);
  const isNew = label.dbId === undefined;

  async function save() {
    const text = label.text.trim();
    if (!text) return setMsg('Впиши текст напису.');
    if (text.length > 40) return setMsg('Напис — до 40 символів.');
    setBusy(true); setMsg('');
    const row = labelToRow(label);
    const q = isNew ? supabase!.from('map_labels').insert(row).select('*').single() : supabase!.from('map_labels').update(row).eq('id', label.dbId!).select('*').single();
    const { data, error } = await q;
    setBusy(false);
    if (error) return setMsg(/relation .*map_labels|schema cache/i.test(error.message) ? 'У базі ще немає написів — запусти міграцію 0070_map_labels.sql у Supabase → SQL Editor.' : /row-level|permission/i.test(error.message) ? 'Це може лише адмін.' : /check/i.test(error.message) ? 'Якесь значення поза межами — перевір поля.' : error.message);
    onSaved(labelFromRow(data as Record<string, unknown>));
  }

  const num = (v: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(v) || 0));
  return (
    <section className="madmin mlabel-edit" aria-label={isNew ? 'Новий напис' : 'Змінити напис'}>
      <h4>{isNew ? 'Новий напис' : `Змінити напис «${label.text}»`}</h4>
      <p className="muted">На мапі: тягни ручку в центрі — перенести; ручку на куті — повернути й змінити розмір.</p>
      <label className="mfield">Текст
        <input className="min" value={label.text} maxLength={40} onChange={e => set({ text: e.target.value.replace(/[\r\n]/g, '') })} />
      </label>
      <div className="mlabel-row">
        <label className="mfield">Колір тексту<input type="color" value={label.color} onChange={e => set({ color: e.target.value })} /></label>
        <label className="mfield">Колір обводки<input type="color" value={label.outlineColor} onChange={e => set({ outlineColor: e.target.value })} /></label>
      </div>
      <Select label="Шрифт" value={label.font} searchable onChange={v => set({ font: v })}
        options={LABEL_FONTS.map(f => ({ value: f.id, label: f.name }))} />
      <div className="mseg" role="radiogroup" aria-label="Товщина шрифту">
        {BOLD_STEPS.map(([w, name]) => <button key={w} type="button" role="radio" aria-checked={boldStep(label.weight) === w} onClick={() => set({ weight: w })} style={{ fontWeight: w }}>{name}</button>)}
      </div>
      <p className="mlabel-sample" style={{ fontFamily: `"${fontFamily(label.font)}", sans-serif`, fontWeight: label.weight }}>
        {label.text || 'Зразок'} · Ґґ Єє Її 123</p>
      {!fontOk && <p className="mmsg" role="status">Шрифт {font.name} не завантажився (немає інтернету?) — поки показано запасним.</p>}
      <label className="mfield">Товщина обводки, м
        <span className="mlabel-num"><input type="range" min={0} max={20} step={0.5} value={label.outlineW} onChange={e => set({ outlineW: +e.target.value })} />
          <input className="min" type="number" min={0} max={20} step={0.5} value={label.outlineW} onChange={e => set({ outlineW: num(e.target.value, 0, 20) })} /></span>
      </label>
      <label className="mfield">Кут, °
        <span className="mlabel-num"><input type="range" min={-180} max={180} step={1} value={label.angle} onChange={e => set({ angle: +e.target.value })} />
          <input className="min" type="number" min={-180} max={180} step={1} value={Math.round(label.angle)} onChange={e => set({ angle: num(e.target.value, -180, 180) })} /></span>
      </label>
      <label className="mfield">Розмір, м
        <span className="mlabel-num"><input type="range" min={5} max={400} step={1} value={label.size} onChange={e => set({ size: +e.target.value })} />
          <input className="min" type="number" min={5} max={400} step={1} value={Math.round(label.size)} onChange={e => set({ size: num(e.target.value, 5, 400) })} /></span>
      </label>
      <div className="mrow">
        <button type="button" className="btn sm ghost" onClick={onCancel}>Скасувати</button>
        <button type="button" className="btn sm acc" disabled={busy} onClick={save}>Зберегти напис</button>
      </div>
      {msg && <p className="mmsg" role="status">{msg}</p>}
    </section>
  );
}
