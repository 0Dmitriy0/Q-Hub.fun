import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/* «зараз у програмі»: скільки гравців із запущеним Q-Hub Desktop (supabase/migrations/0023, app_online), щохвилини.
   null — поки не відомо або функції/бази немає. Шапка й плитка головної беруть одне й те саме */
export function useAppOnline() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const load = () => { supabase!.rpc('app_online').then(({ data, error }) => { if (alive && !error && typeof data === 'number') setN(data); }); };
    load(); const t = setInterval(load, 60e3);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return n;
}
