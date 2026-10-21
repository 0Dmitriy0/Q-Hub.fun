import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Character { id: string; name: string; start_balance: number; goal_name: string; goal: number }
interface Auth {
  ready: boolean;
  session: Session | null;
  name: string;
  avatar: string;
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

  const setCurrent = useCallback((id: string) => { setCurId(id); try { localStorage.setItem(CUR_KEY, id); } catch { /* приватний режим */ } }, []);
  const current = characters.find(c => c.id === curId) || characters[0] || null;
  const meta = session?.user.user_metadata || {};

  const value = useMemo<Auth>(() => ({
    ready, session, characters, current, setCurrent, reloadCharacters,
    name: String(meta.full_name || meta.name || meta.custom_claims?.global_name || ''),
    avatar: String(meta.avatar_url || ''),
    signIn: async () => {
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin + '/kabinet' } });
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); setCharacters([]); }
  }), [ready, session, characters, current, setCurrent, reloadCharacters, meta.full_name, meta.name, meta.avatar_url, meta.custom_claims?.global_name]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth поза AuthProvider');
  return v;
}
