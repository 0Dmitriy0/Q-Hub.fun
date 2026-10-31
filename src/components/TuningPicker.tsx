import { money } from '../lib/format';
import { DRIFT_CHIP, TUNING, TUNING_GROUPS, stageSpeeds, tuningCost, type TuneState } from '../lib/tuning';
import Icon from './Icon';

const PCT = new Map(TUNING);

/* вибір тюнінгу: калькулятор у вікні транспорту і «що встановлено» в гаражі. Плитки по групах замість довгої таблиці:
   клік по плитці — вибрано, «усі» — уся група; STAGE — рівень 1–4 одразу з швидкістю; сума рахується сама.
   prices — поля ціни STAGE і ксенону (їх купують у гравців), лише в калькуляторі */
export default function TuningPicker({ gov, speed, value, onChange, prices, readOnly }: {
  gov: number; speed: number | null; value: TuneState; onChange: (t: TuneState) => void;
  prices?: { stage: string; xenon: string; set: (k: 'stage' | 'xenon', v: string) => void }; readOnly?: boolean;
}) {
  const has = new Set(value.items);
  const set = (items: Iterable<string>) => onChange({ ...value, items: TUNING.map(t => t[0]).filter(n => new Set(items).has(n)) });
  const toggle = (n: string) => { const s = new Set(has); s.has(n) ? s.delete(n) : s.add(n); set(s); };
  const speeds = speed ? stageSpeeds(speed) : [];

  return (
    <div className={'tp' + (readOnly ? ' tp-ro' : '')}>
      {TUNING_GROUPS.map(g => {
        const all = g.items.every(n => has.has(n)), n = g.items.filter(x => has.has(x)).length;
        return (
          <fieldset key={g.title} className="tp-g" disabled={readOnly}>
            <legend><span>{g.title}</span><small className="muted">{n} з {g.items.length}</small>
              {!readOnly && <button type="button" className="tp-all" onClick={() => set(all ? [...has].filter(x => !g.items.includes(x)) : [...has, ...g.items])}>{all ? 'зняти' : 'усі'}</button>}</legend>
            <div className="tp-grid">{g.items.map(name => (
              <button type="button" key={name} className={'tp-it' + (has.has(name) ? ' on' : '')} aria-pressed={has.has(name)} onClick={() => toggle(name)}>
                <span className="tp-ck" aria-hidden="true">{has.has(name) && <Icon name="check" size={12} />}</span>
                <span className="tp-n">{name}</span>
                {gov > 0 && <span className="tp-p mono">{money(tuningCost(gov, PCT.get(name) ?? 0))}</span>}
              </button>))}
            </div>
          </fieldset>);
      })}
      <fieldset className="tp-g" disabled={readOnly}>
        <legend><span>Чіпи й світло</span></legend>
        <div className="tp-stage" role="radiogroup" aria-label="Чіп автотюнінгу STAGE">
          {[0, 1, 2, 3, 4].map(k => (
            <button type="button" key={k} role="radio" aria-checked={value.stage === k} className={'tp-st' + (value.stage === k ? ' on' : '')} onClick={() => onChange({ ...value, stage: k })}>
              <b>{k ? `Stage ${k}` : 'Без STAGE'}</b>{k > 0 && speeds[k - 1] ? <small className="mono">{speeds[k - 1]} км/год</small> : <small>{k ? '' : speed ? `${speed} км/год` : ''}</small>}
            </button>))}
        </div>
        {prices && value.stage > 0 && <label className="tp-price">Ціна чіпа Stage {value.stage} у гравців<input className="vd-in" inputMode="numeric" placeholder="ціна, $" value={prices.stage} onChange={e => prices.set('stage', e.target.value)} /></label>}
        <div className="tp-grid">
          <button type="button" className={'tp-it' + (value.drift ? ' on' : '')} aria-pressed={value.drift} onClick={() => onChange({ ...value, drift: !value.drift })}>
            <span className="tp-ck" aria-hidden="true">{value.drift && <Icon name="check" size={12} />}</span><span className="tp-n">Чіп «DRIFT»</span><span className="tp-p mono">{money(DRIFT_CHIP)}</span>
          </button>
          <button type="button" className={'tp-it' + (value.xenon ? ' on' : '')} aria-pressed={value.xenon} onClick={() => onChange({ ...value, xenon: !value.xenon })}>
            <span className="tp-ck" aria-hidden="true">{value.xenon && <Icon name="check" size={12} />}</span><span className="tp-n">Ксенон</span>
          </button>
        </div>
        {prices && value.xenon && <label className="tp-price">Ціна ксенону у гравців<input className="vd-in" inputMode="numeric" value={prices.xenon} onChange={e => prices.set('xenon', e.target.value)} /></label>}
      </fieldset>
    </div>
  );
}
