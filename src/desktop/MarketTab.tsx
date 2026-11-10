import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { MARKET_HINT, MARKET_MAX, MARKET_MIN, MARKET_WARN, marketHours, marketLeft } from '../lib/alerts';

/* Таймер оголошення на маркеті (specs/077) — вкладка над плашкою поруч із найближчим івентом: видно в будь-якому режимі.
   Гравець сам уводить, на скільки годин виставив оголошення: програма маркет гри не читає (конституція, I).
   Таймер зберігає головний процес (settings.market, свій у кожного персонажа) — він же сповіщає за годину й у кінці;
   тут лише залишок, порахований з моменту завершення. */
export interface Market { hours: number; ends: number }
interface Api { marketSet(hours: string): Promise<{ market?: Market; error?: string } | null>; marketClear(): Promise<unknown> }
const api = (window as unknown as { qhub: Api }).qhub;

export default function MarketTab({ market, onChange }: { market: Market | null; onChange: (m: Market | null) => void }) {
  const [now, setNow] = useState(Date.now());
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!market) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 20e3);
    return () => clearInterval(t);
  }, [market]);

  const close = () => { setEdit(false); setVal(''); setErr(''); };
  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (marketHours(val) === null) { setErr(MARKET_HINT); return; }
    const r = await api.marketSet(val);
    if (!r || r.error || !r.market) { setErr(r?.error || MARKET_HINT); return; }
    onChange(r.market); close();
  }
  const clear = async () => { await api.marketClear(); onChange(null); };

  if (edit) return (
    /* клавіші поля — його власні: Esc закриває поле, а не плашку, Tab не перемикає режим */
    <form className="btab bmk edit" onSubmit={start} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } }}>
      <label htmlFor="bmk-h">Оголошення на</label>
      <input id="bmk-h" autoFocus inputMode="numeric" maxLength={2} value={val} placeholder={`${MARKET_MIN}–${MARKET_MAX}`} aria-invalid={!!err} aria-describedby={err ? 'bmk-err' : undefined}
        onChange={e => { setVal(e.target.value.replace(/[^0-9]/g, '')); setErr(''); }} />
      <span>год</span>
      <button type="submit" className="bmk-go">Запустити</button>
      <button type="button" className="bmk-x" onClick={close} aria-label="Закрити" title="Закрити"><Icon name="x" size={13} /></button>
      {err && <small id="bmk-err" role="alert">{err}</small>}
    </form>
  );
  if (!market) return <button type="button" className="btab bmk idle" onClick={() => setEdit(true)} title="Виставив оголошення на маркеті — запусти таймер: нагадаю за годину до кінця й коли воно завершиться"><Icon name="tag" size={13} />Таймер оголошення</button>;

  const left = marketLeft(market.ends, now);
  const soon = !left || market.ends - now <= MARKET_WARN;
  return (
    <div className={'btab bmk' + (soon ? ' soon' : '')}>
      <Icon name="tag" size={13} />
      <button type="button" className="bmk-t" onClick={() => setEdit(true)} title="Запустити таймер заново">{left ? `Оголошення · ${left}` : 'Оголошення завершилось'}</button>
      <button type="button" className="bmk-x" onClick={clear} aria-label={left ? 'Скасувати таймер оголошення' : 'Закрити'} title={left ? 'Скасувати таймер' : 'Закрити'}><Icon name="x" size={13} /></button>
    </div>
  );
}
