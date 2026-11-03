import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { desktop } from '../../lib/app';
import { money, when } from '../../lib/format';
import { duration, presetRange, sessionMs, summarize, type Day, type Preset, type Range, type SessionRow } from '../../lib/earnings';
import Icon from '../../components/Icon';
import type { Character } from './types';

const PRESETS: [Preset, string][] = [['today', 'Сьогодні'], ['week', 'Тиждень'], ['month', 'Місяць'], ['all', 'Весь час']];
const dayName = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
const showDay = (d: string) => dayName.format(new Date(d + 'T12:00:00Z'));
const perHour = (v: number | null) => (v === null ? '—' : money(v) + '/год');

/* «Заробив» (головне) і «Чистими» — однаково для «Весь час» і для обраного проміжку */
function Totals({ t }: { t: Day }) {
  return (
    <div className="stats earn-stats">
      <div><small>Зіграно з програмою</small><b>{duration(t.ms)}</b></div>
      <div><small>Заробив</small><b>{money(t.gain)}</b><span className="earn-ph">{perHour(t.perHourGain)}</span></div>
      <div><small>Чистими</small><b className={t.net < 0 ? 'bad' : ''}>{money(t.net)}</b><span className={'earn-ph' + (t.perHourNet !== null && t.perHourNet < 0 ? ' bad' : '')}>{perHour(t.perHourNet)}</span></div>
    </div>
  );
}

/* стовпчики «Заробив $/год» по днях (US3): старіші ліворуч */
function Chart({ days }: { days: Day[] }) {
  const pts = [...days].reverse().filter(d => d.perHourGain !== null);
  if (pts.length < 2) return null;
  const top = Math.max(...pts.map(d => d.perHourGain as number), 1);
  return (
    <div className="earn-chart" role="img" aria-label={`Заробіток за годину по днях: ${pts.map(d => `${showDay(d.day)} — ${perHour(d.perHourGain)}`).join('; ')}`}>
      {pts.map(d => (
        <div key={d.day} className="earn-col" title={`${showDay(d.day)}: ${perHour(d.perHourGain)}`}>
          <span className="earn-bar" style={{ height: `${Math.max(2, ((d.perHourGain as number) / top) * 100)}%` }} />
          <small>{d.day.slice(8)}</small>
        </div>
      ))}
    </div>
  );
}

/* заробіток персонажа за годину (specs/044): з підсумків сеансів, які пише програма Q-Hub; бачить лише власник (RLS) */
export default function Earnings({ c }: { c: Character }) {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [minMinutes, setMin] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState<Preset | null>('week');
  const [range, setRange] = useState<Range>(() => presetRange('week'));
  const [open, setOpen] = useState('');
  const [sure, setSure] = useState('');

  const reload = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [s, r] = await Promise.all([
      supabase.from('game_sessions').select('id, started_at, money_from, money_to, money_start, money_end, money_gain, money_flag')
        .eq('character_id', c.id).not('money_from', 'is', null).order('started_at').limit(5000),
      supabase.from('money_rules').select('min_minutes').maybeSingle(),
    ]);
    setError(s.error ? 'Не вдалося завантажити. Перевір інтернет і онови сторінку.' : '');
    setRows((s.data as SessionRow[]) || []);
    if (r.data?.min_minutes) setMin(r.data.min_minutes);
    setLoading(false);
  }, [c.id]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => desktop?.onChanged?.(reload), [reload]);

  const all = useMemo(() => summarize(rows, {}, minMinutes), [rows, minMinutes]);
  const sel = useMemo(() => summarize(rows, range, minMinutes), [rows, range, minMinutes]);

  function pick(p: Preset) { setPreset(p); setRange(presetRange(p)); }
  function setEdge(k: 'from' | 'to', v: string) { setPreset(null); setRange(r => ({ ...r, [k]: v || undefined })); }
  async function del(s: SessionRow) {
    if (sure !== s.id) { setSure(s.id || ''); setTimeout(() => setSure(x => (x === s.id ? '' : x)), 3000); return; }
    const { error } = await supabase!.from('game_sessions').delete().eq('id', s.id!);
    setSure('');
    if (error) setError('Не вдалося прибрати сеанс.'); else reload();
  }

  if (loading && !rows.length) return <div className="card empty">Завантаження…</div>;
  if (!rows.length) return (
    <>
      {error && <p className="err">{error}</p>}
      <div className="card empty">
        Ще немає даних — запусти гру з програмою Q-Hub. Після кожного сеансу тут з'явиться, скільки заробляє {c.name} за годину.
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}><Link className="btn acc" to="/programa"><Icon name="download" />Завантажити програму</Link></div>
      </div>
    </>
  );

  return (
    <>
      <section className="card hero">
        <span className="lbl">Весь час</span>
        <Totals t={all.total} />
      </section>

      <section className="card">
        <div className="row between earn-range">
          <div className="seg earn-seg" role="group" aria-label="Проміжок">
            {PRESETS.map(([p, l]) => <button key={p} type="button" className={preset === p ? 'on' : ''} aria-pressed={preset === p} onClick={() => pick(p)}>{l}</button>)}
          </div>
          <div className="row">
            <label className="fld">Від<input type="date" value={range.from || ''} max={range.to} onChange={e => setEdge('from', e.target.value)} /></label>
            <label className="fld">До<input type="date" value={range.to || ''} min={range.from} onChange={e => setEdge('to', e.target.value)} /></label>
          </div>
        </div>

        {sel.days.length ? <>
          <Totals t={sel.total} />
          <Chart days={sel.days} />
          <div className="scroll">
            <table className="t earn-t">
              <thead><tr><th>День</th><th>Час</th><th className="n">Заробив</th><th className="n">За годину</th><th className="n">Чистими</th></tr></thead>
              <tbody>{sel.days.map(d => (
                <Fragment key={d.day}>
                  <tr>
                    <td><button type="button" className="earn-day" aria-expanded={open === d.day} onClick={() => setOpen(o => (o === d.day ? '' : d.day))}>
                      <Icon name="chev" size={14} className={open === d.day ? '' : 'tr'} />{showDay(d.day)}</button>
                      {sel.best === d.day && sel.days.length > 1 && <span className="pill good">Найкращий</span>}</td>
                    <td>{duration(d.ms)}</td>
                    <td className="n">{money(d.gain)}</td>
                    <td className="n"><b>{perHour(d.perHourGain)}</b></td>
                    <td className={'n' + (d.net < 0 ? ' bad' : '')}>{money(d.net)}</td>
                  </tr>
                  {open === d.day && d.sessions.map(s => (
                    <tr key={s.id} className="earn-sess">
                      <td>{when(s.started_at)}{s.money_flag && <span className="pill warn">сумнівне зчитування</span>}</td>
                      <td>{duration(sessionMs(s))}</td>
                      <td className="n">{money(s.money_gain)}</td>
                      <td className="n muted">—</td>
                      <td className="n">{money(s.money_end - s.money_start)}
                        <button type="button" className="btn sm ghost edit-only" onClick={() => del(s)}>{sure === s.id ? `Так, прибрати ${when(s.started_at)}` : 'Прибрати'}</button></td>
                    </tr>
                  ))}
                </Fragment>
              ))}</tbody>
            </table>
          </div>
        </> : <div className="empty">За ці дні сеансів немає.</div>}

        {error && <p className="err">{error}</p>}
        <p className="muted earn-note">
          День — за початком сеансу (київський час). Рахуються лише сеанси з програмою Q-Hub, час — від першого до останнього зчитування балансу.
          «Заробив» — усі надходження, зокрема перекази й продаж майна; «Чистими» — різниця балансу з урахуванням витрат.
          Баланс — готівка й картка з HUD; інші рахунки, бізнеси й майно не враховуються.
          {sel.total.skipped > 0 && <> Не враховано сеансів: {sel.total.skipped} — коротші за {minMinutes} хв або з сумнівним зчитуванням.</>}
        </p>
      </section>
    </>
  );
}
