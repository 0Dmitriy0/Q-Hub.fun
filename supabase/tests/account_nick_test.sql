-- Нік акаунта й персонажі зі своїм статіком, ціна від персонажа (0038, specs/025).
-- Запуск: supabase/tests/run.sh (після player_prices_test: скупник fish і товар «Окунь» з межами 35–267 уже є)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000009a', '{"full_name":"NickOne"}'),
  ('00000000-0000-0000-0000-00000000009b', '{"full_name":"NickTwo"}'),
  ('00000000-0000-0000-0000-00000000009c', '{"full_name":"NickAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000009c';

create function public.test_err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
grant execute on function public.test_err(text) to anon, authenticated;   -- лише на час тесту, наприкінці видаляється

-- гість: персонажів не бачить, нік не пише, ціну не вносить
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.characters) = 0, 'гість бачить персонажів';
  assert public.test_err($q$update public.profiles set nick = 'Hacker' where id = '00000000-0000-0000-0000-00000000009a'$q$) like 'permission denied%', 'гість змінив нік';
end $$;
reset role;

-- гравець 1: нік вибирає сам; формат; зміна не частіше раз на 30 днів; чужого ніка не змінить
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000009a', false) \gset
do $$ declare e text; begin
  e := public.test_err($q$update public.profiles set nick = 'd vyrx' where id = auth.uid()$q$);
  assert e like '%profiles_nick_format%', 'нік з пробілом прийнято: ' || coalesce(e, 'без помилки');
  update public.profiles set nick = 'D_VYRX' where id = auth.uid();
  assert (select nick_changed_at from public.profiles where id = auth.uid()) > now() - interval '1 minute', 'час зміни ніка не записано';
  e := public.test_err($q$update public.profiles set nick = 'D_VYRX_2' where id = auth.uid()$q$);
  assert e like 'Нік можна змінити знову з %', 'нік змінено вдруге за 30 днів: ' || coalesce(e, 'без помилки');
  assert public.test_err($q$update public.profiles set nick_changed_at = now() - interval '1 year' where id = auth.uid()$q$) like 'permission denied%', 'гравець переставив час зміни ніка';
  update public.profiles set nick = 'Stolen' where id = '00000000-0000-0000-0000-00000000009b';
end $$;
reset role;
do $$ begin assert (select nick from public.profiles where id = '00000000-0000-0000-0000-00000000009b') is null, 'змінено чужий нік'; end $$;

-- гравець 2: нік іншого регістру — зайнятий
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000009b', false) \gset
do $$ begin
  assert public.test_err($q$update public.profiles set nick = 'd_vyrx' where id = auth.uid()$q$) = 'Нік «d_vyrx» уже зайнятий.', 'зайнятий нік (інший регістр) прийнято';
  update public.profiles set nick = 'Second_1' where id = auth.uid();
end $$;
reset role;

-- admin змінює нік без обмеження 30 днів
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000009c', false) \gset
update public.profiles set nick = 'Admin_One' where id = auth.uid();
update public.profiles set nick = 'Admin_Two' where id = auth.uid();
reset role;

-- гравець 1: персонажі зі своїм статіком, формат імені, статік унікальний, не більше трьох
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000009a', false) \gset
insert into public.characters (name, static_id) values ('Dmitriy_Corex', 171028), ('Jacson_Coreee', 188231);
do $$ begin
  assert (select static_id from public.characters where name = 'Dmitriy_Corex') = 171028, 'другий персонаж змінив статік першого';
  assert public.test_err($q$insert into public.characters (name, static_id) values ('saha_23', 5)$q$) like 'Ім''я й прізвище персонажа%', 'ім''я saha_23 прийнято';
  assert public.test_err($q$insert into public.characters (name, static_id) values ('Third_One', 171028)$q$) = 'Статік 171028 уже має інший персонаж.', 'зайнятий статік прийнято';
  insert into public.characters (name, static_id) values ('Third_One', 300001);
  assert public.test_err($q$insert into public.characters (name, static_id) values ('Four_Four', 300002)$q$) = 'В акаунті вже 3 персонажі.', 'четвертого персонажа прийнято';
end $$;
reset role;

-- гравець 2 не бачить персонажів гравця 1; без персонажа ціну не вносить; один персонаж — підставляється сам
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000009b', false) \gset
do $$ begin
  assert (select count(*) from public.characters) = 0, 'видно чужих персонажів';
  assert public.test_err($q$insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 150 from public.items where name = 'Окунь'$q$) = 'Спершу додай персонажа.', 'ціну прийнято без персонажа';
  insert into public.characters (name, static_id) values ('Solo_Player', 300010);
  insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 151 from public.items where name = 'Окунь';
  assert (select c.name from public.price_reports r join public.characters c on c.id = r.character_id where r.reporter = auth.uid()) = 'Solo_Player', 'персонажа не підставлено';
end $$;
reset role;

-- гравець 1 (3 персонажі): без персонажа — відмова, чужий персонаж — відмова, свій — так
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000009a', false) \gset
do $$ begin
  assert public.test_err($q$insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 152 from public.items where name = 'Окунь'$q$) = 'Обери персонажа, з якого вписуєш ціну.', 'ціну без персонажа прийнято при трьох персонажах';
end $$;
reset role;
-- чужий персонаж (Solo_Player гравця 2) — підставляє суперкористувач, бо гравець 1 його id не бачить
select set_config('test.solo', (select id from public.characters where name = 'Solo_Player')::text, false) \gset
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000009a', false) \gset
do $$ begin
  assert public.test_err(format($q$insert into public.price_reports (kind, buyer_id, item_id, price, character_id) select 'buyer', 'fish', id, 152, %L::uuid from public.items where name = 'Окунь'$q$,
    current_setting('test.solo'))) = 'Цей персонаж не твій.', 'ціну з чужого персонажа прийнято';
  insert into public.price_reports (kind, buyer_id, item_id, price, character_id)
    select 'buyer', 'fish', i.id, 153, c.id from public.items i, public.characters c where i.name = 'Окунь' and c.name = 'Jacson_Coreee';
end $$;
reset role;

-- без ніка ціну не прийме, навіть з персонажем зі статіком
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000009d', '{"full_name":"NoNick"}') on conflict (id) do nothing;
insert into public.characters (owner, name, static_id) values ('00000000-0000-0000-0000-00000000009d', 'No_Nick', 300020);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000009d', false) \gset
do $$ begin
  assert public.test_err($q$insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 154 from public.items where name = 'Окунь'$q$) = 'Спершу вибери нік акаунта.', 'ціну без ніка прийнято';
end $$;
reset role;

-- гість: нік і персонаж біля ціни, без статіку; рейтинг під ніком
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select reporter_name || ' · ' || reporter_character from public.price_updates
          where reporter_id = '00000000-0000-0000-0000-00000000009a' order by created_at desc limit 1) = 'D_VYRX · Jacson_Coreee', 'в оновленнях немає ніка й персонажа';
  assert (select name from public.contributors where id = '00000000-0000-0000-0000-00000000009a') = 'D_VYRX', 'рейтинг не під ніком';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name in ('price_updates', 'contributors', 'buyer_next_change')
                     and column_name in ('reporter_static', 'static_id', 'game_name', 'reporter_game')), 'статік чи нік персонажа в публічних зведеннях';
end $$;
reset role;

-- видалений персонаж: ціна лишається, персонажа в ній немає
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000009a', false) \gset
delete from public.characters where name = 'Jacson_Coreee';
reset role;
do $$ begin
  assert exists (select 1 from public.price_reports where reporter = '00000000-0000-0000-0000-00000000009a' and price = 153 and character_id is null),
    'ціна зникла разом з персонажем';
end $$;

-- прибирання
delete from public.price_reports where reporter in ('00000000-0000-0000-0000-00000000009a', '00000000-0000-0000-0000-00000000009b', '00000000-0000-0000-0000-00000000009d');
drop function public.test_err(text);
\echo 'Нік і персонажі ok: нік — формат, унікальний без регістру, раз на 30 днів (admin — без обмеження), чужий не змінити; персонаж — Ім''я_Прізвище, статік унікальний, ≤ 3; ціна — нік + свій персонаж, один підставляється сам; публічно — нік і персонаж без статіку; видалений персонаж лишає ціни'
