import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/* «зараз у програмі»: скільки гравців із запущеним Q-Hub Desktop (supabase/migrations/0023, app_online).
   Поки функції в базі немає або бази немає зовсім — нічого не показує */
export default function AppOnline() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const load = () => { supabase!.rpc('app_online').then(({ data, error }) => { if (alive && !error && typeof data === 'number') setN(data); }); };
    load(); const t = setInterval(load, 60e3);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (n === null) return null;
  return (
    <Link to="/programa" className="online" title="Гравців із запущеною програмою Q-Hub зараз">
      <span className="online-dot" aria-hidden="true" /><b className="mono">{n}</b><span className="online-t">у програмі</span>
    </Link>
  );
}
