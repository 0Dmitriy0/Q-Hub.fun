-- Q-Hub: три Discord у підвалі сайту (плашка «Discord» з вибором): Q-Hub, сім'я CORE, торговий майданчик.
-- discord_url (0045) лишається посиланням Discord Q-Hub — його ж бере програма й інструкції; поруч — family_url і market_url.
-- Змінює лише admin (на сторінці «Програма»). Порожньо — пункту в плашці немає. Файл можна запускати повторно.
alter table public.site_links add column if not exists family_url text not null default ''
  check (family_url = '' or family_url ~ '^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]{2,64}/?$');
alter table public.site_links add column if not exists market_url text not null default ''
  check (market_url = '' or market_url ~ '^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]{2,64}/?$');

-- запрошення від власника 2026-11-02; заповнюються лише порожні, а Discord Q-Hub — лише якщо там ще стартове з 0045
-- (те, що адмін змінив сам, не перезаписується)
insert into public.site_links (id) values (true) on conflict (id) do nothing;
update public.site_links set family_url = 'https://discord.gg/U4SZvvRueT' where family_url = '';
update public.site_links set market_url = 'https://discord.gg/KcCRVzpVAR' where market_url = '';
update public.site_links set discord_url = 'https://discord.gg/RMHEtGC8gJ' where discord_url in ('', 'https://discord.gg/RxUk5mGgy');
