import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/* без ключів сайт працює в режимі «налаштуй Supabase»: публічні сторінки без бази, кабінет недоступний */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } })
  : null;
