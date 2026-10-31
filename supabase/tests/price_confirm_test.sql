-- Ціна скупника — після N різних акаунтів з тією самою ціною (0043, specs/029, конституція 1.1.0 принцип IV).
-- Запуск: supabase/tests/run.sh (після seed каталогу)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', '{"full_name":"Voter1"}'),
  ('00000000-0000-0000-0000-0000000000c2', '{"full_name":"Voter2"}'),
  ('00000000-0000-0000-0000-0000000000c3', '{"full_name":"Voter3"}'),
  ('00000000-0000-0000-0000-0000000000c4', '{"full_name":"VoteAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user', nick = 'Voter_One' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'user', nick = 'Voter_Two' where id = '00000000-0000-0000-0000-0000000000c2';
update public.profiles set role = 'user', nick = 'Voter_Three' where id = '00000000-0000-0000-0000-0000000000c3';
update public.profiles set role = 'admin', nick = 'Vote_Admin' where id = '00000000-0000-0000-0000-0000000000c4';
insert into public.characters (owner, name, static_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'Voter_Alpha', 60001), ('00000000-0000-0000-0000-0000000000c1', 'Voter_Beta', 60002),
  ('00000000-0000-0000-0000-0000000000c2', 'Voter_Gamma', 60003), ('00000000-0000-0000-0000-0000000000c3', 'Voter_Delta', 60004),
  ('00000000-0000-0000-0000-0000000000c4', 'Voter_Admin', 60005);

-- товар «Шкур» з межами 1000–2000, поточна 1500 добу тому
select set_config('test.it', (select item_id from public.buyer_items where buyer_id = 'hide' order by item_id offset 4 limit 1)::text, false) as it \gset
select coalesce(min_price, 0) as old_min, coalesce(max_price, 0) as old_max, coalesce(price, 0) as old_price, coalesce(price_at::text, '') as old_at from public.buyer_items
  where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint \gset
update public.buyer_items set min_price = 1000, max_price = 2000, price = 1500, price_at = now() - interval '1 day'
  where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint;

-- голос від імені акаунта (персонаж — за іменем, бо в c1 їх два); ціна поточна зараз
create function public.test_vote(p_who text, p_char text, p_price bigint, p_source text default 'desktop') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000' || p_who, true);
  insert into public.price_reports (kind, buyer_id, item_id, price, source, character_id)
    values ('buyer', 'hide', current_setting('test.it')::bigint, p_price, p_source, (select id from public.characters where name = p_char));
end $$;
create function public.test_now() returns bigint language sql as $$
  select price from public.buyer_items where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint $$;
create function public.test_clear() returns void language sql as $$
  delete from public.price_reports where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint;
  update public.buyer_items set price = 1500, price_at = now() - interval '1 day' where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint $$;
grant execute on function public.test_vote(text, text, bigint, text), public.test_now() to authenticated;   -- лише на час тесту

-- 1) два персонажі одного акаунта — один голос
set role authenticated;
select public.test_vote('c1', 'Voter_Alpha', 1600);
select public.test_vote('c1', 'Voter_Beta', 1600);
reset role;
do $$ begin
  assert public.test_now() = 1500, 'два персонажі одного акаунта підтвердили ціну';
  assert (select votes from public.price_pending where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint and price = 1600) = 1, 'голосів не 1';
end $$;

-- 2) інша ціна від другого акаунта — нічого не підтверджено, видно обидва варіанти
set role authenticated;
select public.test_vote('c2', 'Voter_Gamma', 1610);
reset role;
do $$ begin
  assert public.test_now() = 1500, 'різні ціни підтвердили одна одну';
  assert (select count(*) from public.price_pending where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint) = 2, 'не видно двох варіантів';
end $$;

-- 3) голос старший за вікно (3 год) не рахується
update public.price_reports set created_at = now() - interval '4 hours'
  where reporter = '00000000-0000-0000-0000-0000000000c1' and item_id = current_setting('test.it')::bigint;
set role authenticated;
select public.test_vote('c3', 'Voter_Delta', 1600);
reset role;
do $$ begin
  assert public.test_now() = 1500, 'голос поза вікном підтвердив ціну';
end $$;

-- 4) два акаунти у вікні — ціна поточна
select public.test_clear();
set role authenticated;
select public.test_vote('c1', 'Voter_Alpha', 1700);
select public.test_vote('c2', 'Voter_Gamma', 1700);
reset role;
do $$ begin
  assert public.test_now() = 1700, 'два акаунти не підтвердили ціну';
  assert (select price_by from public.buyer_items where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint) = '00000000-0000-0000-0000-0000000000c2', 'автор — не той, хто підтвердив';
  assert (select count(*) from public.price_updates where item_id = current_setting('test.it')::bigint and buyer_id = 'hide' and confirmed) = 2, 'в оновленнях не позначено обидва голоси';
end $$;

-- 5) та сама ціна, що вже стоїть (старша за 30 хв), — один гравець оновлює лише час
update public.buyer_items set price_at = now() - interval '2 hours' where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint;
set role authenticated;
select public.test_vote('c3', 'Voter_Delta', 1700);
reset role;
do $$ begin
  assert (select price_at > now() - interval '1 minute' from public.buyer_items where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint), 'та сама ціна не оновила час';
end $$;

-- 6) admin вручну — одразу; admin з програми — звичайний голос
select public.test_clear();
set role authenticated;
select public.test_vote('c4', 'Voter_Admin', 1800, 'desktop');
reset role;
do $$ begin assert public.test_now() = 1500, 'admin з програми поставив ціну одним голосом'; end $$;
select public.test_clear();
set role authenticated;
select public.test_vote('c4', 'Voter_Admin', 1800, 'player');
reset role;
do $$ begin assert public.test_now() = 1800, 'admin вручну не поставив ціну одразу'; end $$;

-- 7) N міняє лише admin; N = 1 — одразу, N = 3 — «2 з 3»
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false) \gset
update public.price_rules set confirm_n = 1;
reset role;
do $$ begin assert (select confirm_n from public.price_rules) = 2, 'гравець змінив N'; end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', false) \gset
update public.price_rules set confirm_n = 1;
reset role;
select public.test_clear();
set role authenticated;
select public.test_vote('c1', 'Voter_Alpha', 1900);
reset role;
do $$ begin assert public.test_now() = 1900, 'N = 1: ціна не поточна одразу'; end $$;
update public.price_rules set confirm_n = 3;
select public.test_clear();
set role authenticated;
select public.test_vote('c1', 'Voter_Alpha', 1950);
select public.test_vote('c2', 'Voter_Gamma', 1950);
reset role;
do $$ begin
  assert public.test_now() = 1500, 'N = 3: двох голосів вистачило';
  assert (select votes || '/' || need from public.price_pending where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint and price = 1950) = '2/3', 'немає «2 з 3»';
end $$;
set role authenticated;
select public.test_vote('c3', 'Voter_Delta', 1950);
reset role;
do $$ begin assert public.test_now() = 1950, 'N = 3: третій голос не підтвердив'; end $$;

-- гість бачить варіанти й правило, але не сирі голоси
update public.price_rules set confirm_n = 2;
select public.test_clear();
set role authenticated;
select public.test_vote('c1', 'Voter_Alpha', 1650);
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select votes from public.price_pending where buyer_id = 'hide' and price = 1650) = 1, 'гість не бачить варіанта';
  assert (select confirm_n from public.price_rules) = 2, 'гість не бачить правила';
  assert (select count(*) from public.price_reports) = 0, 'гість бачить сирі голоси';
end $$;
reset role;

-- прибирання
select public.test_clear();
update public.buyer_items set min_price = :'old_min', max_price = :'old_max', price = :'old_price', price_at = nullif(:'old_at', '')::timestamptz
  where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint;
delete from public.characters where owner in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c4');
drop function public.test_vote(text, text, bigint, text);
drop function public.test_now();
drop function public.test_clear();
\echo 'Підтвердження ціни ok: персонажі одного акаунта — один голос; різні ціни й голоси поза вікном не рахуються; два акаунти — поточна; та сама ціна оновлює час; admin вручну одразу, з програми — голос; N міняє лише admin (1 і 3)'
