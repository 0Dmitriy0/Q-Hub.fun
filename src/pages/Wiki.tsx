import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { JOBS } from '../data/jobs';
import Icon from '../components/Icon';
import { kyivDay, phase } from '../lib/seasons';
import { useViewNav } from '../lib/viewNav';

/* WIKI: довідник гравця — роботи, транспорт і івенти під одним розділом, перемикач угорі (design/stitch/wikijob.html, wikicar.html) */
export default function Wiki() {
  const { pathname } = useLocation();
  const vnav = useViewNav();
  /* вкладка з рискою: риска — окремий елемент, View Transitions переносить її на нову вкладку */
  const tab = (to: string, ico: string, label: string, extra?: ReactNode) => (
    <NavLink to={to} role="tab" onClick={vnav(to)}>{({ isActive }) => <><Icon name={ico} size={16} />{label}{extra}{isActive && <span className="wiki-line" aria-hidden="true" />}</>}</NavLink>
  );
  const [cars, setCars] = useState<number | null>(null);
  /* робіт — стільки ж, скільки на сторінці «Роботи» (довідник у базі, з доданими гравцями); бази немає — вбудований список */
  const [jobsN, setJobsN] = useState(JOBS.length);
  /* скільки сезонних івентів триває зараз (specs/055); 0 не показуємо */
  const [live, setLive] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).then(({ count, error }) => { if (!error && count != null) setCars(count); });
    supabase.from('jobs').select('*', { count: 'exact', head: true }).then(({ count, error }) => { if (!error && count) setJobsN(count); });
    const today = kyivDay(Date.now());
    supabase.from('season_events').select('starts_on,ends_on').then(({ data }) =>
      setLive((data || []).filter(e => phase(e.starts_on, e.ends_on, today).kind === 'now').length));
  }, []);
  const here = pathname.startsWith('/wiki/transport') ? 'Транспорт' : pathname.startsWith('/wiki/iventy') ? 'Івенти'
    : pathname.startsWith('/wiki/gaidy') ? 'Гайди' : pathname.startsWith('/wiki/glosariy') ? 'Глосарій' : 'Роботи';
  return (
    <div className="wiki">
      <div className="wiki-top">
        <nav className="wiki-crumbs mono" aria-label="Де ти зараз"><Link to="/">Q-Hub</Link><span aria-hidden="true">/</span><Link to="/wiki">WIKI</Link><span aria-hidden="true">/</span><span aria-current="page">{here}</span></nav>
        <div className="wiki-tabs" role="tablist" aria-label="Розділ WIKI">
          {tab('/wiki/roboty', 'jobs', 'Роботи', <span className="cnt mono">{jobsN}</span>)}
          {tab('/wiki/transport', 'car', 'Транспорт', cars != null && <span className="cnt mono">{cars}</span>)}
          {tab('/wiki/iventy', 'spark', 'Івенти', live > 0 && <span className="cnt mono" title="Тривають зараз">{live}</span>)}
          {tab('/wiki/gaidy', 'book', 'Гайди')}
          {tab('/wiki/glosariy', 'tag', 'Глосарій')}
        </div>
      </div>
      <Outlet />
    </div>
  );
}

/* старі адреси /roboty і /transport ведуть у WIKI зі збереженням ?job=… (посилання з мапи й закладки) */
export function ToWiki({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={to + search} replace />;
}
