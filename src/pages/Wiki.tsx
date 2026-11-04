import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { JOBS } from '../data/jobs';
import Icon from '../components/Icon';
import { kyivDay, phase } from '../lib/seasons';

/* WIKI: довідник гравця — роботи, транспорт і івенти під одним розділом, перемикач угорі (design/stitch/wikijob.html, wikicar.html) */
export default function Wiki() {
  const { pathname } = useLocation();
  const [cars, setCars] = useState<number | null>(null);
  /* скільки сезонних івентів триває зараз (specs/055); 0 не показуємо */
  const [live, setLive] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).then(({ count, error }) => { if (!error && count != null) setCars(count); });
    const today = kyivDay(Date.now());
    supabase.from('season_events').select('starts_on,ends_on').then(({ data }) =>
      setLive((data || []).filter(e => phase(e.starts_on, e.ends_on, today).kind === 'now').length));
  }, []);
  const here = pathname.startsWith('/wiki/transport') ? 'Транспорт' : pathname.startsWith('/wiki/iventy') ? 'Івенти' : 'Роботи';
  return (
    <div className="wiki">
      <div className="wiki-top">
        <nav className="wiki-crumbs mono" aria-label="Де ти зараз"><Link to="/">Q-Hub</Link><span aria-hidden="true">/</span><Link to="/wiki">WIKI</Link><span aria-hidden="true">/</span><span aria-current="page">{here}</span></nav>
        <div className="wiki-tabs" role="tablist" aria-label="Розділ WIKI">
          <NavLink to="/wiki/roboty" role="tab"><Icon name="jobs" size={16} />Роботи<span className="cnt mono">{JOBS.length}</span></NavLink>
          <NavLink to="/wiki/transport" role="tab"><Icon name="car" size={16} />Транспорт{cars != null && <span className="cnt mono">{cars}</span>}</NavLink>
          <NavLink to="/wiki/iventy" role="tab"><Icon name="spark" size={16} />Івенти{live > 0 && <span className="cnt mono" title="Тривають зараз">{live}</span>}</NavLink>
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
