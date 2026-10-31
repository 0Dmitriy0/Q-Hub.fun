import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Select from './Select';
import type { VehicleFull } from './VehicleDialog';

type Num = 'price' | 'salon_price' | 'min_level' | 'speed' | 'trunk' | 'tank' | 'seats';
const NUMS: [Num, string, string][] = [
  ['price', 'Державна вартість, $', 'від неї рахується тюнінг'], ['salon_price', 'Вартість у салоні', 'порожньо — не продається'],
  ['min_level', 'Мінімальний рівень', ''], ['speed', 'Макс. швидкість, км/год', ''], ['seats', 'Місць (з водієм)', ''],
  ['tank', 'Бак, л / батарея', ''], ['trunk', 'Багажник, слотів', ''],
];
const str = (v: number | null | undefined) => (v == null ? '' : String(v));
const num = (s: string): number | null | 'bad' => { const t = s.replace(/[\s,]/g, ''); if (!t) return null; const n = Number(t); return Number.isInteger(n) && n >= 0 ? n : 'bad'; };

/* редагування характеристик транспорту (адмін і редактори — так дозволяє база) */
export default function VehicleEdit({ v, onSaved, onCancel }: { v: VehicleFull; onSaved: (v: VehicleFull) => void; onCancel: () => void }) {
  const [f, setF] = useState(() => ({
    name: v.name, real_name: v.real_name || '', brand: v.brand, salon: v.salon, kind: v.kind,
    fuel: v.fuel || 'petrol', currency: v.currency || 'game', exclusive: !!v.exclusive, vinyl: !!v.vinyl,
    ...Object.fromEntries(NUMS.map(([k]) => [k, str(v[k] as number | null | undefined)])) as Record<Num, string>,
  }));
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => setF(x => ({ ...x, [k]: val }));

  async function save() {
    if (!f.name.trim()) return setMsg('Назва не може бути порожньою.');
    const nums: Partial<Record<Num, number | null>> = {};
    for (const [k, label] of NUMS) { const n = num(f[k]); if (n === 'bad') return setMsg(`«${label}» — ціле число без мінуса.`); nums[k] = n; }
    const row = {
      name: f.name.trim(), real_name: f.real_name.trim(), brand: f.brand.trim(), salon: f.salon.trim(), kind: f.kind, fuel: f.fuel,
      currency: f.currency, exclusive: f.exclusive, vinyl: f.vinyl, ...nums,
      price: nums.price ?? 0, salon_price: f.exclusive ? null : nums.salon_price ?? null,
    };
    setBusy(true); setMsg('');
    const { data, error } = await supabase!.from('vehicles').update(row).eq('id', v.id).select().single();
    setBusy(false);
    if (error) return setMsg(/duplicate|unique/i.test(error.message) ? 'Транспорт з такою назвою вже є.' : /row-level|permission/i.test(error.message) ? 'Змінювати транспорт можуть лише адмін і редактори.' : 'Не вдалося зберегти: ' + error.message);
    onSaved({ ...v, ...(data as VehicleFull), image_url: v.image_url });
  }

  return (
    <section className="vedit" aria-label="Редагування транспорту">
      <div className="vedit-grid">
        <label>Назва<input className="min" value={f.name} onChange={e => set('name', e.target.value)} /></label>
        <label>Реальна назва<input className="min" value={f.real_name} onChange={e => set('real_name', e.target.value)} placeholder="напр. BMW M5" /></label>
        <label>Марка<input className="min" value={f.brand} onChange={e => set('brand', e.target.value)} /></label>
        <label>Салон<input className="min" value={f.salon} onChange={e => set('salon', e.target.value)} /></label>
        <div className="vedit-sel"><span>Тип</span><Select label="Тип" value={f.kind} onChange={v2 => set('kind', v2)} options={[{ value: 'auto', label: 'Авто' }, { value: 'moto', label: 'Мото' }, { value: 'avia', label: 'Авіа' }, { value: 'boat', label: 'Водний' }]} /></div>
        <div className="vedit-sel"><span>Двигун</span><Select label="Двигун" value={f.fuel} onChange={v2 => set('fuel', v2)} options={[{ value: 'petrol', label: 'Пальне' }, { value: 'diesel', label: 'Дизель' }, { value: 'electric', label: 'Електро' }]} /></div>
        <div className="vedit-sel"><span>Валюта салону</span><Select label="Валюта салону" value={f.currency} onChange={v2 => set('currency', v2)} options={[{ value: 'game', label: 'Ігрова ($)' }, { value: 'donate', label: 'Донатна' }]} /></div>
        {NUMS.map(([k, label, hint]) => (
          <label key={k}>{label}<input className="min mono" inputMode="numeric" value={f[k]} disabled={k === 'salon_price' && f.exclusive}
            onChange={e => set(k, e.target.value)} placeholder={hint || '—'} /></label>
        ))}
      </div>
      <div className="mrow">
        <label className="mcheck"><input type="checkbox" checked={f.exclusive} onChange={e => set('exclusive', e.target.checked)} /> Ексклюзив (у салоні не купити)</label>
        <label className="mcheck"><input type="checkbox" checked={f.vinyl} onChange={e => set('vinyl', e.target.checked)} /> Підтримка вінілів</label>
      </div>
      <div className="mrow">
        <button type="button" className="btn ghost" onClick={onCancel}>Скасувати</button>
        <button type="button" className="btn acc" disabled={busy} onClick={save}>{busy ? 'Зберігаю…' : 'Зберегти'}</button>
      </div>
      {msg && <p className="mmsg" role="alert">{msg}</p>}
    </section>
  );
}
