import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { desktop } from './app';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/* без ключів сайт працює в режимі «налаштуй Supabase»: публічні сторінки без бази, кабінет недоступний */
/* у програмі сесією володіє сама програма (оновлює токени й передає сюди) — сторінка їх не оновлює й не зберігає:
   одноразовий refresh-токен, використаний двічі, викинув би з акаунта */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, {
    auth: desktop
      ? { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'qhub-desktop' }
      : { flowType: 'pkce', persistSession: true, detectSessionInUrl: true }
  })
  : null;
