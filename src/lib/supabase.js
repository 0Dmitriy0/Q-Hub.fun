import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
/* без ключів сайт працює в режимі «налаштуй Supabase»: публічні сторінки без бази, кабінет недоступний */
export const supabase = url && key
    ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } })
    : null;
