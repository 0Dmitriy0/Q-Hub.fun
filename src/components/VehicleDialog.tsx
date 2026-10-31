import { useEffect, useRef, useState } from 'react';
import { money, parseMoney } from '../lib/format';
import { TUNING, XENON_DEFAULT, emptyTune, tuneTotal, type TuneState } from '../lib/tuning';
import Icon from './Icon';
import { priceKind, salonLabel } from '../lib/vehiclePrice';
import VehicleEdit from './VehicleEdit';
import TuningPicker from './TuningPicker';

/* двигун (0044): дизель — fuelType 3 з configvehicle гри; електро — поле electric */
export const FUEL_WORD = { petrol: 'пальне', diesel: 'дизель', electric: 'електро' } as const;
export function FuelTag({ fuel, size, tank }: { fuel?: 'petrol' | 'diesel' | 'electric'; size: number; tank?: number | null }) {
  if (fuel === 'electric') return <span className="fuel-tag el"><Icon name="bolt" size={size} />Електро</span>;
  return <span className="fuel-tag"><Icon name="fuel" size={size} />{fuel === 'diesel' ? 'Дизель' : 'Пальне'}{tank != null ? ` · ${tank} л` : ''}</span>;
}

export interface VehicleFull {
  id: number; kind: 'auto' | 'moto' | 'avia' | 'boat'; name: string; brand: string; salon: string; price: number;
  speed: number | null; trunk: number | null; tank: number | null; seats: number | null; image_url: string;
  real_name?: string; min_level?: number | null; salon_price?: number | null; exclusive?: boolean; vinyl?: boolean; fuel?: 'petrol' | 'diesel' | 'electric'; ua_plate?: boolean | null; currency?: 'game' | 'donate'; model?: string | null;
}

export const KIND_ICON: Record<VehicleFull['kind'], string> = { auto: 'car', moto: 'moto', avia: 'plane', boat: 'boat' };

/* вікно транспорту як у грі: фото, тюнінг з калькулятором і характеристики.
   Тюнінг рахується від держ. вартості; ціну чіпа STAGE і ксенону гравець вписує сам (їх купують у гравців) */
export default function VehicleDialog({ v, onClose, canEdit, onSaved }: { v: VehicleFull | null; onClose: () => void; canEdit?: boolean; onSaved?: (v: VehicleFull) => void }) {
  const [edit, setEdit] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const [tune, setTune] = useState<TuneState>(emptyTune);
  const [pr, setPr] = useState({ stage: '', xenon: String(XENON_DEFAULT) });

  useEffect(() => {
    if (v) { setEdit(false); setTune(emptyTune()); setPr({ stage: '', xenon: String(XENON_DEFAULT) }); dlg.current?.showModal(); }
    else dlg.current?.close();
  }, [v?.id]);
  if (!v) return <dialog ref={dlg} className="modal vmodal" onClose={onClose} />;

  const gov = v.price || 0;
  const total = tuneTotal(gov, tune, { stage: parseMoney(pr.stage), xenon: parseMoney(pr.xenon) });
  const any = tune.items.length > 0 || tune.drift || tune.stage > 0 || tune.xenon;
  /* STAGE вибрано, а ціни немає — у сумі його немає: кажемо прямо, а не мовчки занижуємо */
  const noStagePrice = tune.stage > 0 && !(parseMoney(pr.stage) > 0);

  return (
    <dialog ref={dlg} className="modal vmodal wdlg" aria-labelledby="vd-title" onClose={onClose} onClick={e => { if (e.target === dlg.current) onClose(); }}>
      <div className="modal-box">
        <div className="wdlg-h">
          <span className="wdlg-ico"><Icon name={KIND_ICON[v.kind]} size={26} /></span>
          <div className="wdlg-t"><h2 id="vd-title">{v.name}{v.real_name ? <span className="muted vd-real"> ({v.real_name})</span> : null}</h2>
            <div className="jd-tags">{v.brand && <span className="jtag lvl">{v.brand}{v.salon ? ' · ' + v.salon : ''}</span>}{v.exclusive && <span className="excl-badge inline"><Icon name="star" size={14} />Ексклюзив</span>}</div></div>
          {canEdit && !edit && <button type="button" className="btn sm" onClick={() => setEdit(true)}><Icon name="tag" size={15} />Редагувати</button>}
          <button type="button" className="hud-b wdlg-x" onClick={onClose} aria-label="Закрити" title="Закрити"><Icon name="x" size={18} /></button>
        </div>
        {edit && <VehicleEdit v={v} onCancel={() => setEdit(false)} onSaved={nv => { onSaved?.(nv); setEdit(false); }} />}
        <div className="vd-pic">{v.image_url ? <img src={v.image_url} alt={v.name} /> : <Icon name={KIND_ICON[v.kind]} size={56} />}
          {v.speed != null && <span className="vd-chip mono">{v.speed} км/год · {FUEL_WORD[v.fuel || 'petrol']}</span>}</div>
        <div className="vd-cols">
          <section>
            <h3 className="ih"><Icon name="bolt" size={16} />Елементи тюнінгу</h3>
            {gov > 0 ? <>
              <div className="vd-sel"><button type="button" className="btn sm" onClick={() => setTune(t => ({ ...t, items: TUNING.map(x => x[0]) }))}>Виділити все</button>
                <button type="button" className="btn sm ghost" onClick={() => setTune(emptyTune())}>Зняти все</button></div>
              <TuningPicker gov={gov} speed={v.speed} value={tune} onChange={setTune} prices={{ ...pr, set: (k, val) => setPr(p => ({ ...p, [k]: val })) }} />
              <div className={'vd-total' + (any ? '' : ' idle')} role="status" aria-live="polite">
                <span>Тюнінг: <b className="mono">{money(total)}</b></span>
                <span className="muted">Разом з авто (держ.): <b className="mono">{money(total + gov)}</b></span>
                {noStagePrice && <small className="warn">Ціну чіпа Stage {tune.stage} не вписано — у сумі його немає.</small>}
              </div>
            </> : <p className="muted">Держ. вартість ще не вписана — тюнінг рахується від неї, тож поки порахувати не можна.</p>}
          </section>
          <section>
            <h3 className="ih"><Icon name="shield" size={16} />Інформація</h3>
            <dl className="vd-info">
              {v.min_level != null && <><dt>Мінімальний рівень</dt><dd>{v.min_level}</dd></>}
              <dt>Назва</dt><dd>{v.name}</dd>
              {v.real_name ? <><dt>Реальна назва</dt><dd>{v.real_name}</dd></> : null}
              <dt>Вартість у салоні</dt><dd>{priceKind(v) === 'exclusive' ? <span className="muted">Ексклюзивний транспорт — у салоні придбати неможливо.</span>
                : <><b className={'mono' + (priceKind(v) === 'donate' ? ' donate-c' : '')}>{priceKind(v) === 'donate' && <Icon name="coin" size={15} />}{salonLabel(v)}</b>{priceKind(v) === 'donate' && <small className="muted"> · донатна валюта</small>}</>}</dd>
              <dt>Державна вартість</dt><dd>{gov ? <b className="mono">{money(gov)}</b> : <span className="muted">невідома</span>}</dd>
              {v.speed != null && <><dt>Максимальна швидкість</dt><dd>{v.speed} км/год</dd></>}
            </dl>
            <dl className="vd-info">
              <dt>Двигун</dt><dd><FuelTag fuel={v.fuel} size={14} /></dd>
              {v.tank != null && <><dt>{v.fuel === 'electric' ? 'Батарея' : 'Бак'}</dt><dd>{v.tank}{v.fuel === 'electric' ? '' : ' л'}</dd></>}
              {v.trunk != null && <><dt>Багажник</dt><dd>{v.trunk} слот(ів)</dd></>}
              {v.seats != null && <><dt>Місць</dt><dd>{v.seats}</dd></>}
              {v.vinyl && <><dt>Підтримка вінілів</dt><dd className="good">✓ так</dd></>}
              {v.ua_plate != null && <><dt>Український номер</dt><dd className={v.ua_plate ? 'good' : 'muted'}>{v.ua_plate ? '✓ можна поставити' : 'не ставиться'}</dd></>}
            </dl>
          </section>
        </div>
      </div>
    </dialog>
  );
}
