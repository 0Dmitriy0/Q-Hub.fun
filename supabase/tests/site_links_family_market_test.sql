-- Три Discord (0048): сім'я й торговий майданчик — бачать усі, змінює лише admin, лише запрошення Discord.
-- Запуск: supabase/tests/run.sh (після site_links_test.sql)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000048a01', '{"full_name":"LinkUser48"}'),
  ('00000000-0000-0000-0000-000000048a02', '{"full_name":"LinkAdmin48"}')
  on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000048a02';

-- гравець: читає, але не змінює
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000048a01', false) \gset
do $$ begin
  assert (select family_url from public.site_links) = 'https://discord.gg/RxUk5mGgy', 'гравець не бачить Discord сім''ї';
  update public.site_links set family_url = 'https://discord.gg/hack', market_url = 'https://discord.gg/hack';
end $$;
reset role;
do $$ begin assert (select family_url = 'https://discord.gg/RxUk5mGgy' and market_url = '' from public.site_links), 'гравець змінив посилання'; end $$;

-- адмін: вписує торговий майданчик і сім'ю; чуже чи без https — не проходить
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000048a02', false) \gset
do $$ begin
  update public.site_links set market_url = 'https://discord.gg/QuantMarket', family_url = 'https://discord.com/invite/core-family/';
  assert (select market_url = 'https://discord.gg/QuantMarket' and family_url = 'https://discord.com/invite/core-family/' from public.site_links), 'адмін не змінив посилання';
  begin update public.site_links set market_url = 'https://evil.example/discord.gg/x'; raise exception 'чуже посилання майданчика пройшло';
  exception when check_violation then null; end;
  begin update public.site_links set family_url = 'http://discord.gg/abc'; raise exception 'посилання сім''ї без https пройшло';
  exception when check_violation then null; end;
  update public.site_links set market_url = '', family_url = 'https://discord.gg/RxUk5mGgy';   -- як було
end $$;
reset role;

\echo 'Три Discord ok'
