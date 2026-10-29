import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { desktop, type AppTokens } from './app';

/* static_id — статік персонажа в грі (specs/025); null — у старого персонажа ще не вказаний */
export interface Character { id: string; name: string; static_id?: number | null; start_balance: number; start_card?: number; goal_name: string; goal: number }
interface Auth {
  ready: boolean;
  session: Session | null;
  name: string;
  avatar: string;
  role: string;
  isStaff: boolean;
  /* нік акаунта в Q-Hub (specs/025): null — ще не вибрано, undefined — профіль ще вантажиться */
  nick: string | null | undefined;
  nickChangedAt: string | null;
  saveNick: (nick: string) => Promise<string | null>;
  characters: Character[];
  current: Character | null;
  setCurrent: (id: string) => void;
  reloadCharacters: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<Auth | null>(null);
const CUR_KEY = 'qhub-character';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [role, setRole] = useState('user');
  const [nick, setNick] = useState<string | null | undefined>(undefined);
  const [nickChangedAt, setNickChangedAt] = useState<string | null>(null);
  const [curId, setCurId] = useState<string>(() => { try { return localStorage.getItem(CUR_KEY) || ''; } catch { return ''; } });

  useEffect(() => {
    if (!supabase) return;
    if (desktop) {
      /* сесія з програми: перша при відкритті, далі — щоразу, як програма оновить токени */
      const db = supabase;
      const use = async (t: AppTokens | null) => {
        if (!t) { await db.auth.signOut({ scope: 'local' }); setSession(null); setReady(true); return; }
        if (t.character) setCurId(t.character);
        const { data } = await db.auth.setSession({ access_token: t.access_token, refresh_token: t.refresh_token });
        setSession(data.session); setReady(true);
      };
      desktop.session().then(use);
      desktop.onSession(use);
      return;
    }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const reloadCharacters = useCallback(async () => {
    if (!supabase || !session) { setCharacters([]); return; }
    const full = await supabase.from('characters').select('id,name,static_id,start_balance,start_card,goal_name,goal').order('created_at');
    /* міграцію 0038 (статік персонажа) ще не запущено — без static_id */
    const data = full.error ? (await supabase.from('characters').select('id,name,start_balance,start_card,goal_name,goal').order('created_at')).data : full.data;
    setCharacters((data as Character[]) || []);
  }, [session]);
  useEffect(() => { reloadCharacters(); }, [reloadCharacters]);
  /* роль видно лише собі (RLS); змінити її з сайту не можна */
  useEffect(() => {
    if (!supabase || !session) { setRole('user'); setNick(undefined); return; }
    const id = session.user.id, db = supabase;
    db.from('profiles').select('role,nick,nick_changed_at').eq('id', id).maybeSingle().then(async ({ data, error }) => {
      if (error) {
        /* у базі ще немає стовпця nick (міграцію 0038 не запущено) — роль беремо окремо й сайт не блокуємо */
        const r = await db.from('profiles').select('role').eq('id', id).maybeSingle();
        setRole((r.data?.role as string) || 'user'); setNick(''); return;
      }
      setRole((data?.role as string) || 'user');
      setNick(String(data?.nick ?? '').trim() || null);
      setNickChangedAt((data?.nick_changed_at as string | null) ?? null);
    });
  }, [session?.user.id]);

  /* формат перевіряє src/lib/nick.ts, зайнятість і «раз на 30 днів» — база (0038); її відмова написана для гравця */
  const saveNick = useCallback(async (n: string) => {
    if (!supabase || !session) return 'Спершу увійди через Discord.';
    const { error } = await supabase.from('profiles').update({ nick: n }).eq('id', session.user.id);
    if (error) return error.code === 'P0001' ? error.message : 'Не вдалося зберегти нік. Спробуй ще раз.';
    setNick(n); setNickChangedAt(new Date().toISOString()); return null;
  }, [session]);

  const setCurrent = useCallback((id: string) => { setCurId(id); desktop?.character(id); try { localStorage.setItem(CUR_KEY, id); } catch { /* приватний режим */ } }, []);
  const current = characters.find(c => c.id === curId) || characters[0] || null;
  const meta = session?.user.user_metadata || {};

  const value = useMemo<Auth>(() => ({
    ready, session, characters, current, setCurrent, reloadCharacters,
    role, nick, nickChangedAt, saveNick, isStaff: role === 'editor' || role === 'moderator' || role === 'admin',
    name: String(meta.full_name || meta.name || meta.custom_claims?.global_name || ''),
    avatar: String(meta.avatar_url || ''),
    signIn: async () => {
      /* у програмі вхід — на її власному екрані */
      if (desktop) { await desktop.logout(); return; }
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin + '/kabinet' } });
    },
    signOut: async () => {
      /* у програмі виходить сама програма (анулює свою сесію й повертає на екран входу) */
      if (desktop) { await desktop.logout(); return; }
      if (supabase) await supabase.auth.signOut(); setCharacters([]);
    }
  }), [ready, session, characters, current, setCurrent, reloadCharacters, role, nick, nickChangedAt, saveNick, meta.full_name, meta.name, meta.avatar_url, meta.custom_claims?.global_name]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth поза AuthProvider');
  return v;
}
