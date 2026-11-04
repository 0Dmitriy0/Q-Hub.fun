import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { days, kyivDay, range, type Phase, type SeasonEvent } from '../lib/seasons';
import { arrange, filter, lastDays, type EventFilter, type WithPhase } from '../lib/eventsWiki';
import Icon from '../components/Icon';
import EventForm from '../components/EventForm';

/* WIKI «Івенти» (specs/055): банер поточного батл пасу, плитки сезонних івентів, фільтр «Тривають / Скоро / Архів».
   Щоденні івенти за розкладом (лотерея, НЛО…) — у вкладці «Розклад» на головній, не тут */
type Row = Pick<SeasonEvent, 'id' | 'slug' | 'kind' | 'title' | 'description' | 'image_url' | 'starts_on' | 'ends_on'>;
const FILTERS: [EventFilter, string][] = [['all', 'Усі'], ['now', 'Тривають'], ['soon', 'Скоро'], ['past', 'Архів']];

/* кількість міток на івент: прив'язані категорії → мітки, які бачить цей відвідувач (ті самі правила, що на мапі) */
async function markCounts(): Promise<Record<number, number>> {
  const { data } = await supabase!.from('season_event_maps').select('event_id,category_id');
  const links = (data || []) as { event_id: number; category_id: string }[];
  const cats = [...new Set(links.map(l => l.category_id))];
  const per: Record<string, number> = {};
  await Promise.all(cats.map(async c => {
    const { count } = await supabase!.from('map_points').select('id', { count: 'exact', head: true }).eq('category_id', c);
    per[c] = count ?? 0;
  }));
  const out: Record<number, number> = {};
  for (const l of links) out[l.event_id] = (out[l.event_id] ?? 0) + (per[l.category_id] ?? 0);
  return out;
}

export function PhaseTag({ ph }: { ph: Phase }) {
  const last = lastDays(ph);
  if (ph.kind === 'now') return <span className="ev-tag now">{last ? `Ще ${days(last)}` : 'Триває'}</span>;
  if (ph.kind === 'soon') return <span className="ev-tag soon">Скоро · через {days(ph.in)}</span>;
  return <span className="ev-tag past">Завершився</span>;
}
export const dates = (e: { starts_on: string; ends_on: string | null }, today: string) =>
  e.ends_on ? range(e.starts_on, e.ends_on, today) : `${range(e.starts_on, null, today)} · до оголошення`;

export default function WikiEvents() {
  const { role } = useAuth();
  const staff = role === 'editor' || role === 'moderator' || role === 'admin';
  const [params, setParams] = useSearchParams();
  const f = (FILTERS.find(([k]) => k === params.get('f'))?.[0] ?? 'all') as EventFilter;
  const [rows, setRows] = useState<Row[]>([]);
  const [marks, setMarks] = useState<Record<number, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [adding, setAdding] = useState(false);
  const today = kyivDay(Date.now());

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from('season_events').select('id,slug,kind,title,description,image_url,starts_on,ends_on');
    setLoaded(true);
    if (error) { setMissing(true); return; }
    setMissing(false);
    setRows((data || []) as Row[]);
    markCounts().then(setMarks, () => setMarks({}));
  }
  useEffect(() => { load(); }, []);

  const a = useMemo(() => arrange(rows, today), [rows, today]);
  /* «Усі»: банер уже вгорі — серед плиток його не повторюємо */
  const shown = useMemo(() => filter(rows, f, today).filter(r => f !== 'all' || r.id !== a.banner?.id), [rows, f, today, a.banner]);
  const pick = (k: EventFilter) => setParams(k === 'all' ? {} : { f: k }, { replace: true });

  return (
    <>
      <section className="wiki-hero">
        <div>
          <span className="h-pill"><span className="mdot" aria-hidden="true" />Сезонні й особливі івенти</span>
          <h1>Івенти штату</h1>
          <p className="muted">Хелловін, батл пас та інші івенти QuantRP: що робити, нагороди, дати й готова мапа з мітками, де шукати. Щоденні івенти за розкладом — на головній, у вкладці «Розклад».</p>
        </div>
        <div className="wiki-stats">
          <div><b className="mono">{a.now.length + (a.banner ? 1 : 0)}</b><small>Тривають</small></div>
          <div><b className="mono">{a.soon.length}</b><small>Скоро</small></div>
        </div>
      </section>
      {!supabase && <div className="card empty">База ще не підключена.</div>}
      {missing && staff && <div className="card err">Немає нових полів івентів: запусти <code>supabase/migrations/0051_season_events_wiki.sql</code> у Supabase → SQL Editor.</div>}

      {a.banner && f === 'all' && <BattlePassBanner e={a.banner} today={today} />}

      <div className="tbar-row ev-bar">
        <div className="seg" role="group" aria-label="Які івенти показати">
          {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={f === k} className={f === k ? 'on' : ''} onClick={() => pick(k)}>{label}</button>)}
        </div>
        {staff && !missing && <button type="button" className="btn acc sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Додати івент</button>}
      </div>

      {loaded && !missing && !shown.length && (
        <div className="card empty wiki-none">
          <b>{f === 'past' ? 'В архіві поки порожньо' : f === 'soon' ? 'Найближчим часом нових івентів немає' : 'Зараз івентів немає'}</b>
          {f !== 'past' && <button type="button" className="btn sm" onClick={() => pick('past')}>Переглянути архів</button>}
        </div>
      )}
      {shown.length > 0 && <div className="ev-grid">{shown.map(e => <EventTile key={e.id} e={e} today={today} marks={marks[e.id] ?? 0} />)}</div>}

      {adding && <EventForm row={{}} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </>
  );
}

function EventTile({ e, today, marks }: { e: WithPhase<Row>; today: string; marks: number }) {
  return (
    <Link to={`/wiki/iventy/${e.slug}`} className={'card ev-tile' + (e.ph.kind === 'past' ? ' is-past' : '')}>
      <div className="ev-pic">{e.image_url ? <img src={e.image_url} alt="" loading="lazy" /> : <Icon name="spark" size={40} />}
        <PhaseTag ph={e.ph} />
      </div>
      <div className="ev-body">
        {e.kind === 'battlepass' && <small className="ev-kind">Батл пас</small>}
        <h3 className="ev-title">{e.title}</h3>
        {e.description && <p className="muted ev-desc">{e.description}</p>}
        <div className="ev-meta">
          <span><Icon name="clock" size={15} />{dates(e, today)}</span>
          {marks > 0 && <span><Icon name="map" size={15} />Мапа · {marks}</span>}
        </div>
      </div>
    </Link>
  );
}

function BattlePassBanner({ e, today }: { e: WithPhase<Row>; today: string }) {
  const last = e.ph.kind === 'now' ? e.ph.left : null;
  return (
    <Link to={`/wiki/iventy/${e.slug}`} className="ev-banner" aria-label={`Батл пас: ${e.title}`}>
      {e.image_url ? <img src={e.image_url} alt="" /> : <span className="ev-banner-ph" aria-hidden="true"><Icon name="trophy" size={56} /></span>}
      <div className="ev-banner-txt">
        <small>Батл пас · триває</small>
        <h2>{e.title}</h2>
        <p>{dates(e, today)}{last != null && ` · ще ${days(last)}`}</p>
        <span className="btn acc sm">Нагороди й квести</span>
      </div>
    </Link>
  );
}
