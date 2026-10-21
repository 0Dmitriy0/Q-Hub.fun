import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRows } from '../../lib/useRows';
import { money, parseMoney, signed } from '../../lib/format';
import type { Car, Character } from './types';

export default function GaragePage({ c }: { c: Character }) {
  const { rows, error, reload } = useRows<Car>('cars', c.id, 'pos', true);
  const [f, setF] = useState({ name: '', plate: '', gov: '', paid: '', tune: '' });
  const [sell, setSell] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const own = rows.filter(r => r.status === 'own'), sold = rows.filter(r => r.status === 'sold');

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (!f.name.trim()) { setMsg('Вкажи модель.'); return; }
    const { error } = await supabase!.from('cars').insert({ character_id: c.id, name: f.name.trim(), plate: f.plate.trim().toUpperCase(), gov: parseMoney(f.gov), paid: parseMoney(f.paid), tune: f.tune.trim(), pos: rows.length });
    if (error) { setMsg('Не вдалося додати авто.'); return; }
    setF({ name: '', plate: '', gov: '', paid: '', tune: '' }); reload();
  }
  async function markSold(car: Car) {
    const p = parseMoney(sell[car.id] || '');
    if (!(p > 0)) { setMsg('Вкажи, за скільки продав ' + car.name + '.'); return; }
    await supabase!.from('cars').update({ status: 'sold', sold_price: p, sold_at: new Date().toISOString() }).eq('id', car.id);
    reload();
  }

  return (
    <div className="grid side">
      <section className="card">
        <div className="row between"><h2>Гараж</h2><span className="muted">{own.length} авто</span></div>
        {error && <p className="err">{error}</p>}
        {own.length ? <div className="list">{own.map(car => (
          <div className="li" key={car.id}>
            <div><b>{car.name}</b>{car.plate && <span className="pill" style={{ marginLeft: 8 }}>{car.plate}</span>}<br /><small>держ. {car.gov ? money(car.gov) : '—'} · купив за {car.paid ? money(car.paid) : '—'}{car.tune ? ' · ' + car.tune : ''}</small></div>
            <div className="row"><label className="fld" style={{ width: 130 }}><input aria-label={'Ціна продажу ' + car.name} placeholder="продав за" value={sell[car.id] || ''} onChange={e => setSell({ ...sell, [car.id]: e.target.value })} /></label><button className="btn sm" onClick={() => markSold(car)}>Продано</button></div>
          </div>))}</div> : <div className="empty">Авто ще немає.</div>}
        {sold.length > 0 && <><h3>Продані</h3><div className="list">{sold.map(car => (
          <div className="li" key={car.id}><div><b>{car.name}</b><br /><small>продав за {money(car.sold_price)}{car.paid ? ' · ' : ''}{car.paid ? <span className={car.sold_price - car.paid >= 0 ? 'good' : 'bad'}>{signed(car.sold_price - car.paid)}</span> : null}</small></div></div>))}</div></>}
      </section>
      <section className="card">
        <h2>Додати авто</h2>
        <form className="form" onSubmit={add}>
          <label className="fld">Модель<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Zeekr 001" maxLength={60} /></label>
          <label className="fld">Номер<input value={f.plate} onChange={e => setF({ ...f, plate: e.target.value })} maxLength={16} /></label>
          <label className="fld">Держ. вартість, $<input value={f.gov} onChange={e => setF({ ...f, gov: e.target.value })} inputMode="numeric" /></label>
          <label className="fld">Купив за, $<input value={f.paid} onChange={e => setF({ ...f, paid: e.target.value })} inputMode="numeric" /></label>
          <label className="fld">Тюнінг<input value={f.tune} onChange={e => setF({ ...f, tune: e.target.value })} placeholder="Stage 2, ксенон…" /></label>
          <button className="btn acc">Додати</button>
        </form>
        {msg && <p className="err">{msg}</p>}
      </section>
    </div>
  );
}
