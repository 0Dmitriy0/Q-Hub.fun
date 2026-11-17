/* Сповіщення гравцю на сайті (specs/091 US4, 0077): лічильник непрочитаних, список, прочитання.
   Права — у базі: гравець бачить і позначає лише свої (RLS + notification_read). */
import { supabase } from './supabase';

export interface Notice {
  id: string; title: string; body: string; category: string; prize: string;
  place: number | null; created_at: string; read_at: string | null;
}

export async function unreadCount(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function listMine(limit = 20): Promise<Notice[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('notifications')
    .select('id,title,body,category,prize,place,created_at,read_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as Notice[];
}

export async function markRead(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('notification_read', { p_id: id });
  if (error) throw error;
}

export async function markAllRead(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('notifications_read_all');
  if (error) throw error;
}
