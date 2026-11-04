import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { kyivDay, phase, type EventLevel, type SeasonEvent } from '../lib/seasons';
import { mapLink } from '../lib/eventsWiki';
import { steps } from '../lib/guide';
import Icon from '../components/Icon';
import EventMap from '../components/EventMap';
import EventForm from '../components/EventForm';
import { PhaseTag, dates } from './WikiEvents';

/* сторінка івенту /wiki/iventy/<slug> (specs/055 US2, US3): опис, рівні батл пасу, мапа з мітками івенту */
export default function WikiEvent() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const { role } = useAuth();
  const staff = role === 'editor' || role === 'moderator' || role === 'admin';
  const [e, setE] = useState<SeasonEvent | null>(null);
  const [state, setState] = useState<'load' | 'ok' | 'none' | 'err'>('load');
  const [cats, setCats] = useState<string[]>([]);
  const [levels, setLevels] = useState<EventLevel[]>([]);
  const [prev, setPrev] = useState<{ slug: string; title: string } | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const today = kyivDay(Date.now());

  async function load() {
    if (!supabase) { setState('err'); return; }
    const { data, error } = await supabase.from('season_events').select('*').eq('slug', slug).maybeSingle();
    if (error) { setState('err'); return; }
    if (!data) { setState('none'); return; }
    const ev = data as SeasonEvent;
    setE(ev); setState('ok');
    const [m, l, p] = await Promise.all([
      supabase.from('season_event_maps').select('category_id').eq('event_id', ev.id),
      supabase.from('season_event_levels').select('*').eq('event_id', ev.id).order('level'),
      ev.prev_id ? supabase.from('season_events').select('slug,title').eq('id', ev.prev_id).maybeSingle() : Promise.resolve({ data: null })
    ]);
    setCats(((m.data || []) as { category_id: string }[]).map(r => r.category_id).sort());
    setLevels((l.data || []) as EventLevel[]);
    setPrev((p.data as { slug: string; title: string } | null) ?? null);
  }
  useEffect(() => { setState('load'); setCount(null); load(); }, [slug]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (e) document.title = `${e.title} — івенти · Q-Hub`; }, [e]);

  const body = useMemo(() => steps(e?.body || e?.description || ''), [e]);
  const paid = levels.some(l => l.line === 'paid');
  const rows = useMemo(() => {
    const by = new Map<number, { free?: string; paid?: string }>();
    for (const l of levels) by.set(l.level, { ...by.get(l.level), [l.line]: l.reward });
    return [...by.entries()].sort((a, b) => a[0] - b[0]);
  }, [levels]);

  async function remove() {
    if (!e || !window.confirm(`Видалити івент «${e.title}»? Його рівні й прив'язка до мапи теж зникнуть. Мітки на мапі лишаться.`)) return;
    const { error } = await supabase!.from('season_events').delete().eq('id', e.id);
    if (error) { alert('Не вдалося видалити івент. Спробуй ще раз.'); return; }
    nav('/wiki/iventy', { replace: true });
  }

  const back = <Link to="/wiki/iventy" className="btn sm ghost ev-back"><Icon name="chev" size={16} />Усі івенти</Link>;
  if (state === 'load') return <div className="ev-page">{back}<div className="card empty">Завантажую івент…</div></div>;
  if (state === 'err') return <div className="ev-page">{back}<div className="card err">Не вдалося завантажити івент. Онови сторінку.</div></div>;
  if (state === 'none' || !e) return (
    <div className="ev-page">{back}
      <div className="card empty wiki-none"><b>Такого івенту немає</b><span className="muted">Можливо, адресу змінили.</span><Link className="btn acc sm" to="/wiki/iventy">Усі івенти</Link></div>
    </div>);

  const ph = phase(e.starts_on, e.ends_on, today);
  return (
    <article className="ev-page">
      <div className="row between">{back}
        {staff && <div className="row"><button type="button" className="btn sm" onClick={() => setEditing(true)}><Icon name="edit" size={16} />Змінити</button>
          <button type="button" className="btn sm ghost" onClick={remove}><Icon name="x" size={16} />Видалити</button></div>}
      </div>
      <header className="ev-head">
        <div className="ev-pic big">{e.image_url ? <img src={e.image_url} alt={e.title} /> : <Icon name={e.kind === 'battlepass' ? 'trophy' : 'spark'} size={56} />}<PhaseTag ph={ph} /></div>
        <div>
          {e.kind === 'battlepass' && <small className="ev-kind">Батл пас</small>}
          <h1>{e.title}</h1>
          <p className="ev-meta"><span><Icon name="clock" size={16} />{dates(e, today)}</span>
            {e.link && <a href={e.link} target="_blank" rel="noreferrer"><Icon name="ext" size={16} />Офіційне оголошення</a>}</p>
        </div>
      </header>

      {body.length > 0 && <section className="ev-text">{body.map((s, i) => (
        <div key={i}>{s.text && <p className={s.warn ? 'warn' : undefined}>{s.text}</p>}{s.image && <img src={s.image} alt="" loading="lazy" />}</div>))}</section>}

      {e.kind === 'battlepass' && (
        <section className="ev-sec">
          <h2>Нагороди за рівні</h2>
          {rows.length ? (
            <div className="ev-levels"><table>
              <thead><tr><th scope="col">Рівень</th><th scope="col">Безкоштовно</th>{paid && <th scope="col">Платно</th>}</tr></thead>
              <tbody>{rows.map(([lv, r]) => <tr key={lv}><th scope="row" className="mono">{lv}</th><td>{r.free ?? '—'}</td>{paid && <td>{r.paid ?? '—'}</td>}</tr>)}</tbody>
            </table></div>
          ) : <p className="muted">Нагороди ще не внесено.</p>}
        </section>
      )}

      {cats.length > 0 && (
        <section className="ev-sec">
          <div className="row between"><h2>Де шукати</h2>{count != null && <span className="muted mono">{count} локацій</span>}</div>
          <EventMap categoryIds={cats} onCount={setCount} />
          <Link className="btn acc ev-bigmap" to={mapLink(cats)}><Icon name="map" size={16} />Відкрити на великій мапі</Link>
        </section>
      )}

      {prev && <p className="ev-prev"><Icon name="history" size={16} />Минулого разу: <Link to={`/wiki/iventy/${prev.slug}`}>{prev.title}</Link></p>}

      {editing && <EventForm row={e} onClose={() => setEditing(false)} onSaved={saved => {
        setEditing(false);
        if (saved.slug !== slug) nav(`/wiki/iventy/${saved.slug}`, { replace: true }); else load();
      }} />}
    </article>
  );
}
