-- Q-Hub: запрошення Discord від власника 2026-11-02 — сайт Q-Hub, сім'я CORE, торговий майданчик.
-- 0048 переніс у «сім'ю» стартове запрошення 0045 (RxUk5mGgy), тож «by CORE» вело не на сервер сім'ї.
-- Заповнюються лише порожні поля, а сім'я — ще й якщо там стоїть те стартове; те, що адмін вписав сам, не чіпаємо.
-- Файл можна запускати повторно.
insert into public.site_links (id) values (true) on conflict (id) do nothing;
update public.site_links set family_url = 'https://discord.gg/U4SZvvRueT' where family_url in ('', 'https://discord.gg/RxUk5mGgy');
update public.site_links set market_url = 'https://discord.gg/KcCRVzpVAR' where market_url = '';
update public.site_links set discord_url = 'https://discord.gg/RMHEtGC8gJ' where discord_url = '';
