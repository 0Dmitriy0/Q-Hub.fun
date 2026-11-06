import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/* Хто робить Q-Hub і де питати (specs/033, 037) — одне місце для сайту й програми.
   Назву сім'ї міняють тут; посилання Discord — адмін на сайті (public.site_links), без релізу. */
export const FAMILY = 'CORE';
/* Discord сім'ї від власника 2026-11-02 (0050). «by CORE» веде сюди, поки в базі порожньо або ще стоїть стартове запрошення
   0045, яке 0048 переніс у «сім'ю» (тобто міграцію 0050 ще не застосовано) */
export const FAMILY_DISCORD = 'https://discord.gg/U4SZvvRueT';
const STARTER = 'https://discord.gg/RxUk5mGgy';
export const familyLink = (u: string) => (!u || u.replace(/\/$/, '') === STARTER ? FAMILY_DISCORD : u);

/* лише безстрокові запрошення Discord — так само, як перевірка в 0045/0048 (і DISCORD_RE у desktop/src/main.cjs) */
export const DISCORD_RE = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,64}\/?$/;
export const isDiscordInvite = (u: string) => DISCORD_RE.test(u.trim());

/* три Discord (0048): сайт Q-Hub (питання й допомога), сім'я CORE (підпис «by CORE»), торговий майданчик (ціни, підвал).
   '' — посилання немає чи база не відповіла: тоді кнопки не показуємо */
export type LinkKey = 'discord_url' | 'family_url' | 'market_url';
export type Links = Record<LinkKey, string>;
const EMPTY: Links = { discord_url: '', family_url: '', market_url: '' };
const ok = (u: unknown) => (typeof u === 'string' && isDiscordInvite(u) ? u.trim() : '');

/* одне читання на завантаження сторінки: посилання стоять і в підвалі, і на сторінках */
let cache: Promise<Links> | null = null;
export function loadLinks(fresh = false): Promise<Links> {
  if (!supabase) return Promise.resolve(EMPTY);
  if (!cache || fresh) {
    cache = Promise.resolve(supabase.from('site_links').select('*').maybeSingle())
      .then(({ data }) => (data ? { discord_url: ok(data.discord_url), family_url: ok(data.family_url), market_url: ok(data.market_url) } : EMPTY), () => EMPTY);
  }
  return cache;
}
export const loadDiscord = (fresh = false) => loadLinks(fresh).then(l => l.discord_url);

export function useLinks(): [Links, () => void] {
  const [links, setLinks] = useState<Links>(EMPTY);
  const reload = () => { loadLinks(true).then(setLinks); };
  useEffect(() => { let on = true; loadLinks().then(l => { if (on) setLinks(l); }); return () => { on = false; }; }, []);
  return [links, reload];
}

/* Discord сайту Q-Hub — питання й допомога */
export function useDiscord(): [string, () => void] {
  const [links, reload] = useLinks();
  return [links.discord_url, reload];
}
