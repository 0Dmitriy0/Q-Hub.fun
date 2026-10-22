import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
const Ctx = createContext(null);
const CUR_KEY = 'qhub-character';
export function AuthProvider({ children }) {
    const [ready, setReady] = useState(!supabase);
    const [session, setSession] = useState(null);
    const [characters, setCharacters] = useState([]);
    const [role, setRole] = useState('user');
    const [staticId, setStaticId] = useState(undefined);
    const [gameName, setGameName] = useState('');
    const [curId, setCurId] = useState(() => { try {
        return localStorage.getItem(CUR_KEY) || '';
    }
    catch {
        return '';
    } });
    useEffect(() => {
        if (!supabase)
            return;
        supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
        const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
        return () => data.subscription.unsubscribe();
    }, []);
    const reloadCharacters = useCallback(async () => {
        if (!supabase || !session) {
            setCharacters([]);
            return;
        }
        const { data } = await supabase.from('characters').select('id,name,start_balance,goal_name,goal').order('created_at');
        setCharacters(data || []);
    }, [session]);
    useEffect(() => { reloadCharacters(); }, [reloadCharacters]);
    /* роль видно лише собі (RLS); змінити її з сайту не можна */
    useEffect(() => {
        if (!supabase || !session) {
            setRole('user');
            setStaticId(undefined);
            return;
        }
        const id = session.user.id, db = supabase;
        db.from('profiles').select('role,static_id,game_name').eq('id', id).maybeSingle().then(async ({ data, error }) => {
            if (error) {
                /* у базі ще немає стовпців static_id/game_name (міграції 0007–0008 не запущено) — роль беремо окремо й сайт не блокуємо */
                const r = await db.from('profiles').select('role').eq('id', id).maybeSingle();
                setRole(r.data?.role || 'user');
                setStaticId(0);
                return;
            }
            setRole(data?.role || 'user');
            const g = String(data?.game_name ?? '').trim();
            setGameName(g);
            /* без ніка персонажа профіль теж неповний — вікно попросить обидва */
            setStaticId(g ? data?.static_id ?? null : null);
        });
    }, [session?.user.id]);
    const saveProfile = useCallback(async (game, stat) => {
        if (!supabase || !session)
            return 'Спершу увійди через Discord.';
        const { error } = await supabase.from('profiles').update({ game_name: game, static_id: stat }).eq('id', session.user.id);
        if (error)
            return error.code === '23505' ? 'Цей статік уже вказав інший гравець. Якщо це твій — напиши адміну.' : 'Не вдалося зберегти. Спробуй ще раз.';
        setGameName(game);
        setStaticId(stat);
        return null;
    }, [session]);
    const setCurrent = useCallback((id) => { setCurId(id); try {
        localStorage.setItem(CUR_KEY, id);
    }
    catch { /* приватний режим */ } }, []);
    const current = characters.find(c => c.id === curId) || characters[0] || null;
    const meta = session?.user.user_metadata || {};
    const value = useMemo(() => ({
        ready, session, characters, current, setCurrent, reloadCharacters,
        role, staticId, gameName, saveProfile, isStaff: role === 'editor' || role === 'moderator' || role === 'admin',
        name: String(meta.full_name || meta.name || meta.custom_claims?.global_name || ''),
        avatar: String(meta.avatar_url || ''),
        signIn: async () => {
            if (!supabase)
                return;
            await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin + '/kabinet' } });
        },
        signOut: async () => { if (supabase)
            await supabase.auth.signOut(); setCharacters([]); }
    }), [ready, session, characters, current, setCurrent, reloadCharacters, role, staticId, gameName, saveProfile, meta.full_name, meta.name, meta.avatar_url, meta.custom_claims?.global_name]);
    return _jsx(Ctx.Provider, { value: value, children: children });
}
export function useAuth() {
    const v = useContext(Ctx);
    if (!v)
        throw new Error('useAuth поза AuthProvider');
    return v;
}
