import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { desktop, type AppTokens } from './app';

export interface Character { id: string; name: string; start_balance: number; goal_name: string; goal: number }
interface Auth {
  ready: boolean;
  session: Session | null;
  name: string;
  avatar: string;
  role: string;
  isStaff: boolean;
  /* статік (ігровий ID): null — ще не вказаний, undefined — профіль ще вантажиться */
  staticId: number | null | undefined;
  gameName: string;
  saveProfile: (game: string, stat: number) => Promise<string | null>;
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
  const [staticId, setStaticId] = useState<number | null | undefined>(undefined);
  const [gameName, setGameName] = useState('');
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
    const { data } = await supabase.from('characters').select('id,name,start_balance,goal_name,goal').order('created_at');
    setCharacters((data as Character[]) || []);
  }, [session]);
  useEffect(() => { reloadCharacters(); }, [reloadCharacters]);
  /* роль видно лише собі (RLS); змінити її з сайту не можна */
  useEffect(() => {
    if (!supabase || !session) { setRole('user'); setStaticId(undefined); return; }
    const id = session.user.id, db = supabase;
    db.from('profiles').select('role,static_id,game_name').eq('id', id).maybeSingle().then(async ({ data, error }) => {
      if (error) {
        /* у базі ще немає стовпців static_id/game_name (міграції 0007–0008 не запущено) — роль беремо окремо й сайт не блокуємо */
        const r = await db.from('profiles').select('role').eq('id', id).maybeSingle();
        setRole((r.data?.role as string) || 'user'); setStaticId(0); return;
      }
      setRole((data?.role as string) || 'user');
      const g = String(data?.game_name ?? '').trim(); setGameName(g);
      /* без ніка персонажа профіль теж неповний — вікно попросить обидва */
      setStaticId(g ? (data?.static_id as number | null) ?? null : null);
    });
  }, [session?.user.id]);

  const saveProfile = useCallback(async (game: string, stat: number) => {
    if (!supabase || !session) return 'Спершу увійди через Discord.';
    const { error } = await supabase.from('profiles').update({ game_name: game, static_id: stat }).eq('id', session.user.id);
    if (error) return error.code === '23505' ? 'Цей статік уже вказав інший гравець. Якщо це твій — напиши адміну.' : 'Не вдалося зберегти. Спробуй ще раз.';
    setGameName(game); setStaticId(stat); return null;
  }, [session]);

  const setCurrent = useCallback((id: string) => { setCurId(id); desktop?.character(id); try { localStorage.setItem(CUR_KEY, id); } catch { /* приватний режим */ } }, []);
  const current = characters.find(c => c.id === curId) || characters[0] || null;
  const meta = session?.user.user_metadata || {};

  const value = useMemo<Auth>(() => ({
    ready, session, characters, current, setCurrent, reloadCharacters,
    role, staticId, gameName, saveProfile, isStaff: role === 'editor' || role === 'moderator' || role === 'admin',
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
  }), [ready, session, characters, current, setCurrent, reloadCharacters, role, staticId, gameName, saveProfile, meta.full_name, meta.name, meta.avatar_url, meta.custom_claims?.global_name]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth поза AuthProvider');
  return v;
}
