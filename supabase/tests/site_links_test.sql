-- Посилання Discord Q-Hub (0045, specs/037 FR-004, FR-005): бачать усі, змінює лише admin, лише запрошення Discord.
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f7', '{"full_name":"LinksUser"}'),
  ('00000000-0000-0000-0000-0000000000f8', '{"full_name":"LinksAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000f8';

do $$ begin
  assert (select count(*) from public.site_links) = 1, 'посилань не один рядок';
  assert (select discord_url from public.site_links) = 'https://discord.gg/RxUk5mGgy', 'стартове посилання Discord не те';
end $$;

-- гість: читає, але не змінює
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select discord_url from public.site_links) = 'https://discord.gg/RxUk5mGgy', 'гість не бачить посилань';
  update public.site_links set discord_url = 'https://discord.gg/hack';
  begin insert into public.site_links (id, discord_url) values (true, 'https://discord.gg/hack'); raise exception 'гість вставив посилання';
  exception when insufficient_privilege or unique_violation then null; end;
end $$;
reset role;
do $$ begin assert (select discord_url from public.site_links) = 'https://discord.gg/RxUk5mGgy', 'гість змінив посилання'; end $$;

-- звичайний гравець — так само лише читає
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f7', false) \gset
do $$ begin
  update public.site_links set discord_url = 'https://discord.gg/hack';
  delete from public.site_links;
end $$;
reset role;
do $$ begin assert (select count(*) = 1 and bool_and(discord_url = 'https://discord.gg/RxUk5mGgy') from public.site_links), 'гравець змінив або видалив посилання'; end $$;

-- адмін: змінює; база ставить, хто змінив; не-Discord посилання не проходять
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f8', false) \gset
do $$ begin
  update public.site_links set discord_url = 'https://discord.gg/QhubCORE';
  assert (select discord_url = 'https://discord.gg/QhubCORE' and updated_by = '00000000-0000-0000-0000-0000000000f8' from public.site_links), 'адмін не змінив посилання або не записано, хто';
  update public.site_links set discord_url = 'https://discord.com/invite/abc-123/';
  begin update public.site_links set discord_url = 'https://evil.example/discord.gg/x'; raise exception 'чуже посилання пройшло';
  exception when check_violation then null; end;
  begin update public.site_links set discord_url = 'http://discord.gg/abc'; raise exception 'посилання без https пройшло';
  exception when check_violation then null; end;
  begin insert into public.site_links (id) values (false); raise exception 'другий рядок пройшов';
  exception when check_violation then null; end;
  update public.site_links set discord_url = '';   -- порожньо теж можна: кнопки зникають
  update public.site_links set discord_url = 'https://discord.gg/RxUk5mGgy';
end $$;
reset role;

\i supabase/migrations/0045_site_links.sql
do $$ begin assert (select count(*) = 1 and bool_and(discord_url = 'https://discord.gg/RxUk5mGgy') from public.site_links), 'повторний запуск міграції дублює чи перезаписує посилання'; end $$;
\echo 'Посилання сайту ok'
