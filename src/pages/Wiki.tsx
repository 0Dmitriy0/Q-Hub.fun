import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { JOBS } from '../data/jobs';
import Icon from '../components/Icon';

/* WIKI: довідник гравця — роботи й транспорт під одним розділом, перемикач угорі (design/stitch/wikijob.html, wikicar.html) */
export default function Wiki() {
  const { pathname } = useLocation();
  const [cars, setCars] = useState<number | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).then(({ count, error }) => { if (!error && count != null) setCars(count); });
  }, []);
  const here = pathname.startsWith('/wiki/transport') ? 'Транспорт' : 'Роботи';
  return (
    <div className="wiki">
      <div className="wiki-top">
        <nav className="wiki-crumbs mono" aria-label="Де ти зараз"><Link to="/">Q-Hub</Link><span aria-hidden="true">/</span><Link to="/wiki">WIKI</Link><span aria-hidden="true">/</span><span aria-current="page">{here}</span></nav>
        <div className="wiki-tabs" role="tablist" aria-label="Розділ WIKI">
          <NavLink to="/wiki/roboty" role="tab"><Icon name="jobs" size={16} />Роботи<span className="cnt mono">{JOBS.length}</span></NavLink>
          <NavLink to="/wiki/transport" role="tab"><Icon name="car" size={16} />Транспорт{cars != null && <span className="cnt mono">{cars}</span>}</NavLink>
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
