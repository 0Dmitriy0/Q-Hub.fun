-- Промокод Q-Hub (0031, specs/022 FR-007): бачать усі, змінює лише admin, рядок завжди один.
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f5', '{"full_name":"PromoEditor"}'),
  ('00000000-0000-0000-0000-0000000000f6', '{"full_name":"PromoAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-0000000000f5';   -- промокоди сервера редактор змінює, а QHUB — ні
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000f6';

do $$ begin
  assert (select count(*) from public.site_promo) = 1, 'seed промокоду не один рядок';
  assert (select code = 'QHUB' and reward = 'Отримайте 50.000$ та +1 рівень.' and enabled from public.site_promo), 'seed промокоду не той';
end $$;

-- гість: читає, але не змінює
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select code from public.site_promo) = 'QHUB', 'гість не бачить промокод';
  update public.site_promo set code = 'HACK';
  begin insert into public.site_promo (id, code, reward) values (true, 'HACK', 'x'); raise exception 'гість вставив промокод';
  exception when insufficient_privilege or unique_violation then null; end;
end $$;
reset role;
do $$ begin assert (select code from public.site_promo) = 'QHUB', 'гість змінив промокод'; end $$;

-- редактор (не admin) — так само лише читає
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f5', false) \gset
do $$ begin
  update public.site_promo set enabled = false, reward = 'x';
  delete from public.site_promo;
end $$;
reset role;
do $$ begin assert (select enabled and reward = 'Отримайте 50.000$ та +1 рівень.' from public.site_promo), 'редактор змінив або видалив промокод'; end $$;

-- адмін: змінює й вимикає; другого рядка не буває, код без пробілів
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f6', false) \gset
do $$ begin
  update public.site_promo set reward = 'Нова нагорода', enabled = false;
  assert (select reward = 'Нова нагорода' and not enabled from public.site_promo), 'адмін не змінив промокод';
  begin insert into public.site_promo (id, code, reward) values (false, 'TWO', 'x'); raise exception 'другий рядок пройшов';
  exception when check_violation then null; end;
  begin update public.site_promo set code = 'Q HUB'; raise exception 'код з пробілом пройшов';
  exception when check_violation then null; end;
  update public.site_promo set reward = 'Отримайте 50.000$ та +1 рівень.', enabled = true;
end $$;
reset role;

\i supabase/migrations/0031_site_promo.sql
do $$ begin assert (select count(*) from public.site_promo) = 1, 'повторний запуск міграції дублює промокод'; end $$;
\echo 'Промокод Q-Hub ok'
