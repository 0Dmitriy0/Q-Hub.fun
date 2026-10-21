import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

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
  saveStatic: (v: number) => Promise<string | null>;
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
  const [curId, setCurId] = useState<string>(() => { try { return localStorage.getItem(CUR_KEY) || ''; } catch { return ''; } });

  useEffect(() => {
    if (!supabase) return;
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
    db.from('profiles').select('role,static_id').eq('id', id).maybeSingle().then(async ({ data, error }) => {
      if (error) {
        /* у базі ще немає стовпця static_id (міграцію 0007 не запущено) — роль беремо окремо й сайт не блокуємо */
        const r = await db.from('profiles').select('role').eq('id', id).maybeSingle();
        setRole((r.data?.role as string) || 'user'); setStaticId(0); return;
      }
      setRole((data?.role as string) || 'user');
      setStaticId((data?.static_id as number | null) ?? null);
    });
  }, [session?.user.id]);

  const saveStatic = useCallback(async (v: number) => {
    if (!supabase || !session) return 'Спершу увійди через Discord.';
    const { error } = await supabase.from('profiles').update({ static_id: v }).eq('id', session.user.id);
    if (error) return error.code === '23505' ? 'Цей статік уже вказав інший гравець. Якщо це твій — напиши адміну.' : 'Не вдалося зберегти статік. Спробуй ще раз.';
    setStaticId(v); return null;
  }, [session]);

  const setCurrent = useCallback((id: string) => { setCurId(id); try { localStorage.setItem(CUR_KEY, id); } catch { /* приватний режим */ } }, []);
  const current = characters.find(c => c.id === curId) || characters[0] || null;
  const meta = session?.user.user_metadata || {};

  const value = useMemo<Auth>(() => ({
    ready, session, characters, current, setCurrent, reloadCharacters,
    role, staticId, saveStatic, isStaff: role === 'editor' || role === 'moderator' || role === 'admin',
    name: String(meta.full_name || meta.name || meta.custom_claims?.global_name || ''),
    avatar: String(meta.avatar_url || ''),
    signIn: async () => {
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin + '/kabinet' } });
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); setCharacters([]); }
  }), [ready, session, characters, current, setCurrent, reloadCharacters, role, staticId, saveStatic, meta.full_name, meta.name, meta.avatar_url, meta.custom_claims?.global_name]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth поза AuthProvider');
  return v;
}
