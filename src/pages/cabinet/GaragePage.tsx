import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRows } from '../../lib/useRows';
import { money, parseMoney, signed } from '../../lib/format';
import { matchVehicle, withSitePhotos, type Vehicle } from '../../lib/carMatch';
import Icon from '../../components/Icon';
import type { Car, Character } from './types';

/* гараж як у Quant Hub: плитки з фото, номером і цифрами; фото й марка — з каталогу транспорту сайту за назвою моделі */
export default function GaragePage({ c }: { c: Character }) {
  const { rows, error, reload } = useRows<Car>('cars', c.id, 'pos', true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  useEffect(() => { supabase?.from('vehicles').select('*').limit(1000).then(async ({ data }) => setVehicles(await withSitePhotos((data as Vehicle[]) || []))); }, []);
  const [f, setF] = useState({ name: '', plate: '', gov: '', paid: '', tune: '' });
  const [adding, setAdding] = useState(false);
  const [sell, setSell] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const own = rows.filter(r => r.status === 'own'), sold = rows.filter(r => r.status === 'sold');
  const worth = own.reduce((s, car) => s + (car.gov || matchVehicle(car.name, vehicles)?.price || 0), 0);
  const found = f.name.trim() ? matchVehicle(f.name, vehicles) : null;

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (!f.name.trim()) { setMsg('Вкажи модель.'); return; }
    const gov = parseMoney(f.gov) || found?.price || 0;
    const { error } = await supabase!.from('cars').insert({ character_id: c.id, name: f.name.trim(), plate: f.plate.trim().toUpperCase(), gov, paid: parseMoney(f.paid), tune: f.tune.trim(), pos: rows.length });
    if (error) { setMsg('Не вдалося додати авто.'); return; }
    setF({ name: '', plate: '', gov: '', paid: '', tune: '' }); setAdding(false); reload();
  }
  async function markSold(car: Car) {
    const p = parseMoney(sell[car.id] || '');
    if (!(p > 0)) { setMsg('Вкажи, за скільки продав ' + car.name + '.'); return; }
    await supabase!.from('cars').update({ status: 'sold', sold_price: p, sold_at: new Date().toISOString() }).eq('id', car.id);
    reload();
  }

  return (
    <>
      <section className="card hero">
        <div className="row between">
          <div><span className="lbl">Гараж</span><div className="big" style={{ fontSize: 30 }}>{own.length} авто</div>{worth > 0 && <span className="muted">держ. вартість <b className="mono">{money(worth)}</b></span>}</div>
          <button className="btn acc edit-only" onClick={() => setAdding(a => !a)}>{adding ? 'Сховати' : '+ Додати авто'}</button>
        </div>
        {adding && (
          <form className="form cols edit-only" onSubmit={add}>
            <label className="fld">Модель<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Zeekr 001" maxLength={60} list="vehicles" autoFocus /></label>
            <datalist id="vehicles">{vehicles.map(v => <option key={v.id} value={v.name}>{v.brand}</option>)}</datalist>
            <label className="fld">Номер<input value={f.plate} onChange={e => setF({ ...f, plate: e.target.value })} maxLength={16} /></label>
            <label className="fld">Держ. вартість, ${found?.price ? <small> · з каталогу {money(found.price)}</small> : null}<input value={f.gov} onChange={e => setF({ ...f, gov: e.target.value })} inputMode="numeric" placeholder={found?.price ? String(found.price) : ''} /></label>
            <label className="fld">Купив за, $<input value={f.paid} onChange={e => setF({ ...f, paid: e.target.value })} inputMode="numeric" /></label>
            <label className="fld">Тюнінг<input value={f.tune} onChange={e => setF({ ...f, tune: e.target.value })} placeholder="Stage 2, ксенон…" /></label>
            <button className="btn acc">Додати</button>
          </form>
        )}
        {msg && <p className="err">{msg}</p>}
      </section>
      {error && <p className="err">{error}</p>}
      {own.length ? <div className="cars">{own.map((car, i) => {
        const v = matchVehicle(car.name, vehicles), gov = car.gov || v?.price || 0;
        return (
          <article className="car" key={car.id}>
            <div className="cph">
              {v?.image_url ? <img src={v.image_url} alt={car.name} loading="lazy" /> : <Icon name="car" size={64} />}
              <span className="cpos">#{i + 1}</span>
              {car.plate && <span className="plate">{car.plate}</span>}
            </div>
            <div className="cbody">
              <div className="cname">{car.name}{v?.brand && <small>{v.brand}</small>}</div>
              <div className="ckv">
                <div><small>Держ. вартість</small><b>{gov ? money(gov) : '—'}</b></div>
                <div><small>Купив за</small><b>{car.paid ? money(car.paid) : '—'}</b></div>
                {car.paid > 0 && gov > 0 && <div><small>Проти держ.</small><b className={gov - car.paid >= 0 ? 'good' : 'bad'}>{signed(gov - car.paid)}</b></div>}
                {car.tune && <div><small>Тюнінг</small><b>{car.tune}</b></div>}
              </div>
              <div className="row edit-only">
                <label className="fld" style={{ flex: 1 }}><input aria-label={'Ціна продажу ' + car.name} placeholder="продав за, $" value={sell[car.id] || ''} onChange={e => setSell({ ...sell, [car.id]: e.target.value })} /></label>
                <button className="btn sm" onClick={() => markSold(car)}>Продано</button>
              </div>
            </div>
          </article>);
      })}</div> : <div className="card empty">Тут будуть твої авто. Натисни «+ Додати авто»: модель, номер, ціна — фото підтягнеться з каталогу сайту за назвою.</div>}
      {sold.length > 0 && <section className="card"><h2>Продані</h2><div className="list">{sold.map(car => (
        <div className="li" key={car.id}><div><b>{car.name}</b><br /><small>продав за {money(car.sold_price)}{car.paid ? ' · ' : ''}{car.paid ? <span className={car.sold_price - car.paid >= 0 ? 'good' : 'bad'}>{signed(car.sold_price - car.paid)}</span> : null}</small></div></div>))}</div></section>}
    </>
  );
}
