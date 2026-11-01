import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/* Хто робить Q-Hub і де питати (specs/033, 037) — одне місце для сайту й програми.
   Назву сім'ї міняють тут; посилання Discord — адмін на сайті (public.site_links), без релізу. */
export const FAMILY = 'CORE';

/* лише безстрокові запрошення Discord — так само, як перевірка в 0045_site_links.sql (і DISCORD_RE у desktop/src/main.cjs) */
export const DISCORD_RE = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,64}\/?$/;
export const isDiscordInvite = (u: string) => DISCORD_RE.test(u.trim());

/* одне читання на завантаження сторінки: посилання стоїть і в підвалі, і на сторінках */
let cache: Promise<string> | null = null;
export function loadDiscord(fresh = false): Promise<string> {
  if (!supabase) return Promise.resolve('');
  if (!cache || fresh) {
    cache = Promise.resolve(supabase.from('site_links').select('discord_url').maybeSingle())
      .then(({ data }) => (data && isDiscordInvite(data.discord_url) ? data.discord_url.trim() : ''), () => '');
  }
  return cache;
}

/* '' — посилання ще немає чи база не відповіла: тоді кнопок Discord не показуємо */
export function useDiscord(): [string, () => void] {
  const [url, setUrl] = useState('');
  const reload = () => { loadDiscord(true).then(setUrl); };
  useEffect(() => { let on = true; loadDiscord().then(u => { if (on) setUrl(u); }); return () => { on = false; }; }, []);
  return [url, reload];
}
