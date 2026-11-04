-- Голос за ціну поза межами скупника (0054, specs/035 US1, Q1 = Б): ціна стає поточною від N акаунтів, межі — лише admin.
-- Запуск: supabase/tests/run.sh (після seed каталогу й price_confirm_test.sql)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', '{"full_name":"Odd1"}'),
  ('00000000-0000-0000-0000-0000000000d2', '{"full_name":"Odd2"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user', nick = 'Odd_One' where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'user', nick = 'Odd_Two' where id = '00000000-0000-0000-0000-0000000000d2';
insert into public.characters (owner, name, static_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'Odd_Alpha', 61001), ('00000000-0000-0000-0000-0000000000d2', 'Odd_Gamma', 61002);

-- товар «Мотлоху» з межами 113–325, поточна 300 добу тому (US1: «Пластина» 380 після зміни цін)
select set_config('test.oi', (select item_id from public.buyer_items where buyer_id = 'hide' order by item_id offset 5 limit 1)::text, false) as oi \gset
select coalesce(min_price, 0) as old_min, coalesce(max_price, 0) as old_max, coalesce(price, 0) as old_price, coalesce(price_at::text, '') as old_at from public.buyer_items
  where buyer_id = 'hide' and item_id = current_setting('test.oi')::bigint \gset
update public.buyer_items set min_price = 113, max_price = 325, price = 300, price_at = now() - interval '1 day'
  where buyer_id = 'hide' and item_id = current_setting('test.oi')::bigint;

create function public.test_odd(p_who text, p_char text, p_price bigint, p_out boolean, p_source text default 'desktop') returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000' || p_who, true);
  insert into public.price_reports (kind, buyer_id, item_id, price, source, character_id, out_of_limits)
    values ('buyer', 'hide', current_setting('test.oi')::bigint, p_price, p_source, (select id from public.characters where name = p_char), p_out);
  return 'ok';
exception when others then return sqlerrm;
end $$;
create function public.test_oi() returns public.buyer_items language sql as $$
  select * from public.buyer_items where buyer_id = 'hide' and item_id = current_setting('test.oi')::bigint $$;
grant execute on function public.test_odd(text, text, bigint, boolean, text), public.test_oi() to authenticated;   -- лише на час тесту

set role authenticated;
do $$ begin
  -- 1) без позначки ціна поза межами ±10 % — як і раніше, відмова
  assert public.test_odd('d1', 'Odd_Alpha', 400, false) like 'Ціна 400 $ поза межами%', 'без позначки ціну за межами прийнято';
  -- 2) з позначкою, але надто далеко (> 1,5 × максимуму чи < 0,5 × мінімуму) — відмова (FR-004)
  assert public.test_odd('d1', 'Odd_Alpha', 500, true) like '%надто далеко%', 'зайву цифру прийнято як голос';
  assert public.test_odd('d1', 'Odd_Alpha', 50, true) like '%надто далеко%', 'пропущену цифру прийнято як голос';
  -- 3) позначка не з програми — відмова
  assert public.test_odd('d1', 'Odd_Alpha', 380, true, 'site') like 'Голос поза межами — лише з програми%', 'голос поза межами з сайту прийнято';
  -- 4) один акаунт — голос, ціна не змінилась, межі теж
  assert public.test_odd('d1', 'Odd_Alpha', 380, true) = 'ok', 'голос поза межами не прийнято';
  assert (public.test_oi()).price = 300, 'один акаунт поставив ціну поза межами';
end $$;
reset role;
do $$ begin
  assert (select votes from public.price_pending where buyer_id = 'hide' and item_id = current_setting('test.oi')::bigint and price = 380) = 1, 'немає «1 з 2» для ціни поза межами';
end $$;

-- 5) інша ціна від другого акаунта — не підтверджує
set role authenticated;
do $$ begin
  assert public.test_odd('d2', 'Odd_Gamma', 390, true) = 'ok', 'другий голос не прийнято';
  assert (public.test_oi()).price = 300, 'різні ціни поза межами підтвердили одна одну';
end $$;
-- 6) та сама ціна від другого акаунта — поточна, а межі не змінились (Q1 = Б)
do $$ begin
  assert public.test_odd('d2', 'Odd_Gamma', 380, true) = 'ok', 'другий голос (виправлення за 10 хв) не прийнято';
  assert (public.test_oi()).price = 380, 'два акаунти не поставили ціну поза межами';
  assert (public.test_oi()).min_price = 113 and (public.test_oi()).max_price = 325, 'межі змінились самі';
end $$;

-- 7) гравець не змінює межі напряму (FR-007)
update public.buyer_items set max_price = 999 where buyer_id = 'hide' and item_id = current_setting('test.oi')::bigint;
reset role;
do $$ begin assert (public.test_oi()).max_price = 325, 'гравець змінив межі напряму'; end $$;

-- 8) «перевір межі» рахує різних гравців; повтор того самого не додає, інша ціна — лік з нуля
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false) \gset
select public.report_limit_mismatch('hide', current_setting('test.oi')::bigint, 380);
select public.report_limit_mismatch('hide', current_setting('test.oi')::bigint, 380);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', false) \gset
select public.report_limit_mismatch('hide', current_setting('test.oi')::bigint, 380);
reset role;
do $$ begin
  assert (select cardinality(reporters) || '/' || seen_count from public.buyer_limit_reports
          where buyer_id = 'hide' and item_id = current_setting('test.oi')::bigint) = '2/3', 'гравців не 2 або зчитувань не 3';
end $$;
set role authenticated;
select public.report_limit_mismatch('hide', current_setting('test.oi')::bigint, 360);
reset role;
do $$ begin
  assert (select cardinality(reporters) from public.buyer_limit_reports
          where buyer_id = 'hide' and item_id = current_setting('test.oi')::bigint) = 1, 'інша ціна не почала лік гравців з нуля';
end $$;

-- прибирання
select set_config('request.jwt.claim.sub', '', false) \gset
delete from public.buyer_limit_reports where buyer_id = 'hide' and item_id = current_setting('test.oi')::bigint;
delete from public.price_reports where buyer_id = 'hide' and item_id = current_setting('test.oi')::bigint;
update public.buyer_items set min_price = :'old_min', max_price = :'old_max', price = :'old_price', price_at = nullif(:'old_at', '')::timestamptz
  where buyer_id = 'hide' and item_id = current_setting('test.oi')::bigint;
delete from public.characters where owner in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2');
drop function public.test_odd(text, text, bigint, boolean, text);
drop function public.test_oi();
\echo 'Голос поза межами ok: без позначки й надто далеко — відмова; лише з програми; один акаунт — «1 з 2»; два — поточна, межі не змінились; гравець межі не міняє; «перевір межі» рахує гравців'
