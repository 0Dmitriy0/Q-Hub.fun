import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
/* рядки таблиці персонажа; RLS у базі гарантує, що прийдуть лише свої */
export function useRows(table, characterId, order = 'ts', ascending = false) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const reload = useCallback(async () => {
        if (!supabase || !characterId) {
            setRows([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const { data, error } = await supabase.from(table).select('*').eq('character_id', characterId).order(order, { ascending }).limit(5000);
        setError(error ? 'Не вдалося завантажити дані. Перевір інтернет і онови сторінку.' : '');
        setRows(data || []);
        setLoading(false);
    }, [table, characterId, order, ascending]);
    useEffect(() => { reload(); }, [reload]);
    return { rows, loading, error, reload };
}
