import { useEffect, useRef, useState } from 'react';
import { money, parseMoney } from '../lib/format';
import { DRIFT_CHIP, TUNING, XENON_DEFAULT, stageSpeeds, tuningCost } from '../lib/tuning';
import Icon from './Icon';

export interface VehicleFull {
  id: number; kind: 'auto' | 'moto' | 'avia'; name: string; brand: string; salon: string; price: number;
  speed: number | null; trunk: number | null; tank: number | null; seats: number | null; image_url: string;
  real_name?: string; min_level?: number | null; salon_price?: number | null; exclusive?: boolean; vinyl?: boolean;
}

/* вікно транспорту як у грі: фото, тюнінг з калькулятором і характеристики.
   Тюнінг рахується від держ. вартості; ціну чіпа STAGE і ксенону гравець вписує сам (їх купують у гравців) */
export default function VehicleDialog({ v, onClose }: { v: VehicleFull | null; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [drift, setDrift] = useState(false);
  const [stage, setStage] = useState<'none' | 'stage'>('none');
  const [stagePrice, setStagePrice] = useState('');
  const [xenon, setXenon] = useState(false);
  const [xenonPrice, setXenonPrice] = useState(String(XENON_DEFAULT));
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (v) { setPicked(new Set()); setDrift(false); setStage('none'); setStagePrice(''); setXenon(false); setXenonPrice(String(XENON_DEFAULT)); setTotal(null); dlg.current?.showModal(); }
    else dlg.current?.close();
  }, [v?.id]);
  if (!v) return <dialog ref={dlg} className="modal vmodal" onClose={onClose} />;

  const gov = v.price || 0;
  const toggle = (n: string) => setPicked(p => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; });
  const calc = () => setTotal(TUNING.reduce((s, [n, p]) => s + (picked.has(n) ? tuningCost(gov, p) : 0), 0)
    + (drift ? DRIFT_CHIP : 0) + (stage === 'stage' ? parseMoney(stagePrice) : 0) + (xenon ? parseMoney(xenonPrice) : 0));
  const speeds = v.speed ? stageSpeeds(v.speed) : [];

  return (
    <dialog ref={dlg} className="modal vmodal" aria-labelledby="vd-title" onClose={onClose} onClick={e => { if (e.target === dlg.current) onClose(); }}>
      <div className="modal-box">
        <div className="row between"><h2 id="vd-title" className="ih"><Icon name={v.kind === 'moto' ? 'moto' : v.kind === 'avia' ? 'plane' : 'car'} />{v.name}{v.real_name ? <span className="muted vd-real"> ({v.real_name})</span> : null}</h2>
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Закрити">✕</button></div>
        <div className="vd-pic">{v.image_url ? <img src={v.image_url} alt={v.name} /> : <Icon name={v.kind === 'moto' ? 'moto' : v.kind === 'avia' ? 'plane' : 'car'} size={56} />}</div>
        <div className="vd-cols">
          <section>
            <h3 className="ih"><Icon name="bolt" size={16} />Елементи тюнінгу</h3>
            {gov > 0 ? <>
              <div className="vd-sel"><button type="button" className="btn sm" onClick={() => setPicked(new Set(TUNING.map(t => t[0])))}>Виділити все</button>
                <button type="button" className="btn sm ghost" onClick={() => setPicked(new Set())}>Зняти все</button></div>
              <table className="t vd-t"><thead><tr><th>Елемент</th><th className="n">Вартість</th></tr></thead>
                <tbody>
                  {TUNING.map(([n, p]) => <tr key={n}><td><label className="ck"><input type="checkbox" checked={picked.has(n)} onChange={() => toggle(n)} />{n}</label></td><td className="n">{money(tuningCost(gov, p))}</td></tr>)}
                  <tr><td><label className="ck"><input type="checkbox" checked={drift} onChange={e => setDrift(e.target.checked)} />Чіп автотюнінгу «DRIFT»</label></td><td className="n">{money(DRIFT_CHIP)}</td></tr>
                  <tr><td colSpan={2}><label className="ck"><input type="radio" name={'stage' + v.id} checked={stage === 'none'} onChange={() => setStage('none')} />Без чіпа автотюнінгу «STAGE»</label></td></tr>
                  <tr><td><label className="ck"><input type="radio" name={'stage' + v.id} checked={stage === 'stage'} onChange={() => setStage('stage')} />Чіп автотюнінгу «STAGE»</label></td>
                    <td className="n"><input className="vd-in" inputMode="numeric" placeholder="Вкажи ціну" aria-label="Ціна чіпа STAGE" value={stagePrice} onChange={e => { setStagePrice(e.target.value); setStage('stage'); }} /></td></tr>
                  <tr><td><label className="ck"><input type="checkbox" checked={xenon} onChange={e => setXenon(e.target.checked)} />Ксенон</label></td>
                    <td className="n"><input className="vd-in" inputMode="numeric" aria-label="Ціна ксенону" value={xenonPrice} onChange={e => { setXenonPrice(e.target.value); setXenon(true); }} /></td></tr>
                </tbody></table>
              <button type="button" className="btn acc vd-calc" onClick={calc}><Icon name="chart" />Обрахувати вартість тюнінгу</button>
              {total !== null && <div className="vd-total" role="status"><span>Тюнінг: <b className="mono">{money(total)}</b></span><span className="muted">Разом з авто (держ.): <b className="mono">{money(total + gov)}</b></span></div>}
            </> : <p className="muted">Держ. вартість ще не вписана — тюнінг порахувати не можна.</p>}
          </section>
          <section>
            <h3 className="ih"><Icon name="shield" size={16} />Інформація</h3>
            <dl className="vd-info">
              {v.min_level != null && <><dt>Мінімальний рівень</dt><dd>{v.min_level}</dd></>}
              <dt>Назва</dt><dd>{v.name}</dd>
              {v.real_name ? <><dt>Реальна назва</dt><dd>{v.real_name}</dd></> : null}
              <dt>Вартість у салоні</dt><dd>{v.exclusive || v.salon_price == null ? <span className="muted">Ексклюзивний транспорт — у салоні придбати неможливо.</span> : <b className="mono">{money(v.salon_price)}</b>}</dd>
              <dt>Державна вартість</dt><dd><b className="mono">{gov ? money(gov) : '—'}</b></dd>
              {v.speed != null && <><dt>Максимальна швидкість</dt><dd>{v.speed} км/год</dd></>}
            </dl>
            {speeds.length > 0 && <div className="vd-stages"><b>Максимальна швидкість з чіпами для автотюнінгу:</b>
              <ul>{speeds.map((s, i) => <li key={i}><b>Stage {i + 1}:</b> {s} км/год</li>)}</ul></div>}
            <dl className="vd-info">
              {v.tank != null && <><dt>Бак</dt><dd>{v.tank} л</dd></>}
              {v.trunk != null && <><dt>Багажник</dt><dd>{v.trunk} слот(ів)</dd></>}
              {v.seats != null && <><dt>Місць</dt><dd>{v.seats}</dd></>}
              {v.vinyl && <><dt>Підтримка вінілів</dt><dd className="good">✓ так</dd></>}
            </dl>
          </section>
        </div>
      </div>
    </dialog>
  );
}
