-- Ціна з програми поза межами скупника (0036, specs/004): відмова для гравця й для admin; вручну admin може вийти за межі,
-- гравець — ні; в межах (з допуском ±10 %) з програми — проходить. Запуск: supabase/tests/run.sh (після seed каталогу)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f5', '{"full_name":"AppUser"}'),
  ('00000000-0000-0000-0000-0000000000f6', '{"full_name":"AppAdmin"}')
  on conflict (id) do nothing;
-- нік акаунта й персонаж зі статіком — умова подачі ціни (0038)
update public.profiles set role = 'user', nick = 'App_User' where id = '00000000-0000-0000-0000-0000000000f5';
update public.profiles set role = 'admin', nick = 'App_Admin' where id = '00000000-0000-0000-0000-0000000000f6';
insert into public.characters (owner, name, static_id) values
  ('00000000-0000-0000-0000-0000000000f5', 'App_User', 50005), ('00000000-0000-0000-0000-0000000000f6', 'App_Admin', 50006);

-- товар із межами 1000–2000 (з допуском: 900–2200)
select set_config('test.it', (select item_id from public.buyer_items where buyer_id = 'hide' order by item_id offset 2 limit 1)::text, false) as it \gset
select coalesce(min_price, 0) as old_min, coalesce(max_price, 0) as old_max, coalesce(price, 0) as old_price, coalesce(price_at::text, '') as old_at from public.buyer_items
  where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint \gset
update public.buyer_items set min_price = 1000, max_price = 2000, price = 1500, price_at = now() - interval '1 day'
  where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint;

create function public.test_out_of_limits(p_price bigint, p_source text) returns boolean language plpgsql as $$
begin
  insert into public.price_reports (kind, buyer_id, item_id, price, source) values ('buyer', 'hide', current_setting('test.it')::bigint, p_price, p_source);
  return false;
exception when raise_exception then
  if sqlerrm not like 'Ціна % $ поза межами%' then raise; end if;
  return true;
end $$;
grant execute on function public.test_out_of_limits(bigint, text) to authenticated;   -- лише на час тесту, наприкінці видаляється

-- гравець: з програми й вручну поза межами — відмова; з програми в межах (і впритул, 2 150) — проходить
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f5', false) \gset
do $$ begin
  assert public.test_out_of_limits(51986, 'desktop'), 'гравець: зайва цифра з програми пройшла';
  assert public.test_out_of_limits(198, 'desktop'), 'гравець: пропущена цифра з програми пройшла';
  assert public.test_out_of_limits(9999, 'player'), 'гравець: вручну поза межами пройшло';
  assert not public.test_out_of_limits(2150, 'desktop'), 'гравець: впритул до межі з програми не пройшло';
end $$;
reset role;

-- admin: з програми поза межами — відмова (FR-007); вручну — приймається, як і досі (FR-006)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f6', false) \gset
do $$ begin
  assert public.test_out_of_limits(51986, 'desktop'), 'admin: зайва цифра з програми пройшла';
  assert not public.test_out_of_limits(1700, 'desktop'), 'admin: ціна в межах з програми не пройшла';
  assert not public.test_out_of_limits(2600, 'player'), 'admin: вручну поза межами не прийнято';
end $$;
reset role;

-- у базі лишились лише прийняті ціни: жодної поза межами з програми
do $$ begin
  assert not exists (select 1 from public.price_reports where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint
                     and source = 'desktop' and (price < 900 or price > 2200)), 'ціна поза межами з програми записалась';
end $$;

delete from public.price_reports where reporter in ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f6');
update public.buyer_items set min_price = :'old_min', max_price = :'old_max', price = :'old_price', price_at = nullif(:'old_at', '')::timestamptz
  where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint;
drop function public.test_out_of_limits(bigint, text);
\echo 'Межі цін з програми ok'
