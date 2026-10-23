import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { desktop } from './app';

/* рядки таблиці персонажа; RLS у базі гарантує, що прийдуть лише свої */
export function useRows<T>(table: string, characterId: string | undefined, order = 'ts', ascending = false) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!supabase || !characterId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from(table).select('*').eq('character_id', characterId).order(order, { ascending }).limit(5000);
    setError(error ? 'Не вдалося завантажити дані. Перевір інтернет і онови сторінку.' : '');
    setRows((data as T[]) || []);
    setLoading(false);
  }, [table, characterId, order, ascending]);
  useEffect(() => { reload(); }, [reload]);
  /* у програмі: запис через Alt+Q — одразу видно тут */
  useEffect(() => desktop?.onChanged?.(reload), [reload]);
  return { rows, loading, error, reload };
}
