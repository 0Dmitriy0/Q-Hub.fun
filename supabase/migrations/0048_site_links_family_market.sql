-- Q-Hub: три посилання Discord замість одного (рішення власника 2026-11-03, доповнення до specs/037).
-- • discord_url — Discord сайту Q-Hub: питання й допомога («Програма», часті питання, налаштування програми);
-- • family_url  — Discord сім'ї CORE: підпис «by CORE» у підвалі;
-- • market_url  — торговий майданчик: сторінка «Ціни» й підвал.
-- Поточне посилання (сервер сім'ї CORE) переноситься у family_url, Discord сайту стає порожнім, доки адмін не впише новий.
-- Перевірка та сама, що для discord_url (0045): лише безстрокові запрошення Discord або порожньо. Файл можна запускати повторно.

alter table public.site_links add column if not exists family_url text not null default ''
  check (family_url = '' or family_url ~ '^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]{2,64}/?$');
alter table public.site_links add column if not exists market_url text not null default ''
  check (market_url = '' or market_url ~ '^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]{2,64}/?$');

-- перенос — лише раз: поки сім'я ще порожня; повторний запуск нічого не чіпає
update public.site_links set family_url = discord_url, discord_url = '' where family_url = '' and discord_url <> '';
