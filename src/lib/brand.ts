import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/* Хто робить Q-Hub і де питати (specs/033, 037) — одне місце для сайту й програми.
   Назву сім'ї міняють тут; посилання Discord — адмін на сайті (public.site_links), без релізу. */
export const FAMILY = 'CORE';

/* лише безстрокові запрошення Discord — так само, як перевірка в 0045_site_links.sql (і DISCORD_RE у desktop/src/main.cjs) */
export const DISCORD_RE = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,64}\/?$/;
export const isDiscordInvite = (u: string) => DISCORD_RE.test(u.trim());
/* стартове запрошення з 0045 власник замінив 2026-11-02 (0047); поки міграцію не застосовано, у базі ще старе — показуємо нове */
const REPLACED: Record<string, string> = { 'https://discord.gg/RxUk5mGgy': 'https://discord.gg/RMHEtGC8gJ' };
const current = (u: string) => REPLACED[u.trim().replace(/\/$/, '')] || u.trim();

/* одне читання на завантаження сторінки: посилання стоїть і в підвалі, і на сторінках */
let cache: Promise<string> | null = null;
export function loadDiscord(fresh = false): Promise<string> {
  if (!supabase) return Promise.resolve('');
  if (!cache || fresh) {
    cache = Promise.resolve(supabase.from('site_links').select('discord_url').maybeSingle())
      .then(({ data }) => (data && isDiscordInvite(data.discord_url) ? current(data.discord_url) : ''), () => '');
  }
  return cache;
}

/* три Discord для плашки в підвалі (0047): Q-Hub, сім'я, торговий майданчик. Беруться з public.site_links; поки міграцію
   не застосовано (колонок немає) чи база не відповіла — запрошення від власника 2026-11-02 з коду. '' в базі — пункт сховано */
export interface DiscordLinks { site: string; family: string; market: string }
export const DISCORD_DEFAULTS: DiscordLinks = { site: 'https://discord.gg/RMHEtGC8gJ', family: 'https://discord.gg/U4SZvvRueT', market: 'https://discord.gg/KcCRVzpVAR' };
/* значення з бази: немає колонки (undefined) — запасне з коду; є, але не запрошення чи '' — сховати */
export const pickLink = (v: unknown, fallback: string) => (typeof v !== 'string' ? fallback : isDiscordInvite(v) ? current(v) : '');

let linksCache: Promise<DiscordLinks> | null = null;
export function loadDiscordLinks(fresh = false): Promise<DiscordLinks> {
  if (!supabase) return Promise.resolve(DISCORD_DEFAULTS);
  if (!linksCache || fresh) {
    linksCache = Promise.resolve(supabase.from('site_links').select('*').maybeSingle()).then(({ data, error }) => {
      if (error || !data) return DISCORD_DEFAULTS;
      const d = data as Record<string, unknown>;
      return { site: pickLink(d.discord_url, DISCORD_DEFAULTS.site), family: pickLink(d.family_url, DISCORD_DEFAULTS.family), market: pickLink(d.market_url, DISCORD_DEFAULTS.market) };
    }, () => DISCORD_DEFAULTS);
  }
  return linksCache;
}
export function useDiscordLinks(): [DiscordLinks | null, () => void] {
  const [l, setL] = useState<DiscordLinks | null>(null);
  const reload = () => { loadDiscordLinks(true).then(setL); };
  useEffect(() => { let on = true; loadDiscordLinks().then(x => { if (on) setL(x); }); return () => { on = false; }; }, []);
  return [l, reload];
}

/* '' — посилання ще немає чи база не відповіла: тоді кнопок Discord не показуємо */
export function useDiscord(): [string, () => void] {
  const [url, setUrl] = useState('');
  const reload = () => { loadDiscord(true).then(setUrl); };
  useEffect(() => { let on = true; loadDiscord().then(u => { if (on) setUrl(u); }); return () => { on = false; }; }, []);
  return [url, reload];
}
