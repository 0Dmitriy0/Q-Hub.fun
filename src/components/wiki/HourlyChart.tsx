import { hourlyRates, shortK } from '../../lib/payHourly';

/* Графік «скільки за годину» у вікні роботи (редизайн 2026-11-15): замість абзацу — велике число й смужки.
   Смужки рахуються від спільної шкали SCALE (≈ найприбутковіші роботи сервера), тож їх можна порівнювати між роботами.
   Немає «$ за годину» в тексті — компонент нічого не показує, лишається звичайний текст заробітку */
const SCALE = 200_000;
const money = (n: number) => n.toLocaleString('uk-UA').replace(/\s/g, ' ') + ' $';

export default function HourlyChart({ pay }: { pay: string }) {
  const rates = hourlyRates(pay);
  if (!rates.length) return null;
  /* у заголовку — найприбутковіший рядок (у мисливця «шкури» — додатковий дохід, а не нижня межа) */
  const best = rates.reduce((b, r) => (r.max > b.max ? r : b)), lo = best.min, hi = best.max;
  const top = Math.max(SCALE, hi);
  return (
    <div className="hrc" aria-label={`Заробіток за годину: ${shortK(lo, hi)} доларів`}>
      <div className="hrc-head"><b>{shortK(lo, hi)} $</b><span>за годину</span></div>
      <ul className="hrc-bars">
        {rates.map((r, i) => (
          <li key={i}>
            <span className="hrc-l">{r.label || (rates.length > 1 ? 'загалом' : 'у середньому')}</span>
            <span className="hrc-track" aria-hidden="true">
              {r.min !== r.max && <i className="hrc-range" style={{ left: (r.min / top) * 100 + '%', width: ((r.max - r.min) / top) * 100 + '%' }} />}
              <i className="hrc-fill" style={{ width: (r.min / top) * 100 + '%' }} />
            </span>
            <span className="hrc-v">{r.min === r.max ? money(r.max) : `${money(r.min)} – ${money(r.max)}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
