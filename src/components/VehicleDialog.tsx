import { useEffect, useRef, useState } from 'react';
import { money, parseMoney } from '../lib/format';
import { TUNING, XENON_DEFAULT, emptyTune, tuneTotal, type TuneState } from '../lib/tuning';
import Icon from './Icon';
import { priceKind, salonLabel } from '../lib/vehiclePrice';
import VehicleEdit from './VehicleEdit';
import TuningPicker from './TuningPicker';
import PageMeta from './wiki/PageMeta';
import HistoryDialog from './wiki/HistoryDialog';
import WikiChecks from './wiki/WikiChecks';

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
  /* довідник від гравців (0057) */
  version?: number; hidden?: boolean; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string | null;
}

export const KIND_ICON: Record<VehicleFull['kind'], string> = { auto: 'car', moto: 'moto', avia: 'plane', boat: 'boat' };

/* вікно транспорту як у грі: фото, тюнінг з калькулятором і характеристики.
   Тюнінг рахується від держ. вартості; ціну чіпа STAGE і ксенону гравець вписує сам (їх купують у гравців) */
export default function VehicleDialog({ v, onClose, canEdit, onSaved, onPropose, onHide, onChanged }: { v: VehicleFull | null; onClose: () => void; canEdit?: boolean; onSaved?: (v: VehicleFull) => void; onPropose?: () => void; onHide?: () => void; onChanged?: () => void }) {
  const [edit, setEdit] = useState(false);
  const [hist, setHist] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const [tune, setTune] = useState<TuneState>(emptyTune);
  const [pr, setPr] = useState({ stage: '', xenon: String(XENON_DEFAULT) });

  useEffect(() => {
    if (v) { setEdit(false); setTune(emptyTune()); setPr({ stage: '', xenon: String(XENON_DEFAULT) }); dlg.current?.showModal(); }
    else dlg.current?.close();
  }, [v?.id]);
  const [calcOpen, setCalcOpen] = useState(false);
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
          {!canEdit && onPropose && <button type="button" className="btn ghost sm" onClick={onPropose}><Icon name="tag" size={15} />Запропонувати правку</button>}
          <button type="button" className="hud-b wdlg-x" onClick={onClose} aria-label="Закрити" title="Закрити"><Icon name="x" size={18} /></button>
        </div>
        <PageMeta createdBy={v.created_by} updatedBy={v.updated_by} createdAt={v.created_at} updatedAt={v.updated_at} version={v.version} hidden={v.hidden} onHistory={v.version !== undefined ? () => setHist(true) : undefined} />
        {!v.hidden && <WikiChecks section="vehicle" target={String(v.id)} version={v.version} changedAt={v.updated_at ?? v.created_at} onPropose={onPropose} />}
        <HistoryDialog section="vehicle" target={String(v.id)} title={v.name} hidden={v.hidden} open={hist} onClose={() => setHist(false)} onChanged={onChanged} />
        {!canEdit && onHide && <p className="muted wmeta"><button type="button" className="linkish" onClick={onHide}>Цього транспорту вже немає в грі? Запропонуй прибрати сторінку</button></p>}
        {edit && <VehicleEdit v={v} onCancel={() => setEdit(false)} onSaved={nv => { onSaved?.(nv); setEdit(false); }} />}
        <div className="vd-pic">{v.image_url ? <img src={v.image_url} alt={v.name} /> : <Icon name={KIND_ICON[v.kind]} size={56} />}
          {v.speed != null && <span className="vd-chip mono">{v.speed} км/год · {FUEL_WORD[v.fuel || 'petrol']}</span>}</div>
        {/* головне про транспорт — плитками: ціна, швидкість, багажник, бак… (редизайн 2026-11-15: раніше — довгий список «назва — значення») */}
        <div className="vd-specs">
          <div className="vd-spec vd-spec-price"><span>Ціна в салоні</span><b>{priceKind(v) === 'exclusive' ? <span className="muted">Ексклюзивний транспорт — у салоні придбати неможливо.</span>
                : <><b className={'mono' + (priceKind(v) === 'donate' ? ' donate-c' : '')}>{priceKind(v) === 'donate' && <Icon name="coin" size={15} />}{salonLabel(v)}</b>{priceKind(v) === 'donate' && <small className="muted"> · донатна валюта</small>}</>}</b></div>
          <div className="vd-spec"><span>Державна ціна</span><b>{gov ? money(gov) : '—'}</b></div>
          {v.speed != null && <div className="vd-spec"><Icon name="speed" size={18} /><span>Швидкість</span><b>{v.speed} км/год</b></div>}
          {v.trunk != null && <div className="vd-spec"><Icon name="box" size={18} /><span>Багажник</span><b>{v.trunk} слот(ів)</b></div>}
          {v.tank != null && <div className="vd-spec"><Icon name="fuel" size={18} /><span>{v.fuel === 'electric' ? 'Батарея' : 'Бак'}</span><b>{v.tank}{v.fuel === 'electric' ? '' : ' л'}</b></div>}
          {v.seats != null && <div className="vd-spec"><Icon name="user" size={18} /><span>Місць</span><b>{v.seats}</b></div>}
          {v.min_level != null && <div className="vd-spec"><Icon name="trophy" size={18} /><span>З рівня</span><b>{v.min_level}</b></div>}
        </div>
        <div className="vd-feats">
          <span className="vd-feat"><FuelTag fuel={v.fuel} size={14} /></span>
          {v.vinyl && <span className="vd-feat good"><Icon name="check" size={14} />Вініли</span>}
          {v.ua_plate != null && <span className={'vd-feat' + (v.ua_plate ? ' good' : ' off')}><Icon name={v.ua_plate ? 'check' : 'x'} size={14} />Український номер</span>}
          {v.real_name ? <span className="vd-feat muted">Прототип: {v.real_name}</span> : null}
        </div>
        {/* калькулятор тюнінгу — під кнопкою: потрібен не кожному, а займав пів вікна */}
        <section className="vd-calc">
          <button type="button" className={'btn ' + (calcOpen ? 'ghost' : 'acc')} aria-expanded={calcOpen} onClick={() => setCalcOpen(o => !o)}><Icon name="bolt" size={16} />{calcOpen ? 'Сховати калькулятор тюнінгу' : 'Порахувати тюнінг'}</button>
          {calcOpen && <div className="vd-calc-in">
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
          </div>}
        </section>
      </div>
    </dialog>
  );
}
