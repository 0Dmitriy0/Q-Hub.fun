-- Адмін-панель (0046, specs/039): кожна функція admin_* — лише admin (anon, user, editor, moderator — відмова 42501);
-- атомарний розбір черг, захист ролей, версія в app_ping, знімки training. Запуск: supabase/tests/run.sh (після seed каталогу)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000039a01', '{"full_name":"AdmUser"}'),
  ('00000000-0000-0000-0000-000000039a02', '{"full_name":"AdmEditor"}'),
  ('00000000-0000-0000-0000-000000039a03', '{"full_name":"AdmModer"}'),
  ('00000000-0000-0000-0000-000000039a04', '{"full_name":"AdmBoss"}'),
  ('00000000-0000-0000-0000-000000039a05', '{"full_name":"AdmBoss2"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user', nick = 'Adm_User' where id = '00000000-0000-0000-0000-000000039a01';
update public.profiles set role = 'editor', nick = 'Adm_Editor' where id = '00000000-0000-0000-0000-000000039a02';
update public.profiles set role = 'moderator', nick = 'Adm_Moder' where id = '00000000-0000-0000-0000-000000039a03';
update public.profiles set role = 'admin', nick = 'Adm_Boss' where id = '00000000-0000-0000-0000-000000039a04';
update public.profiles set role = 'user', nick = 'Adm_Boss_Two' where id = '00000000-0000-0000-0000-000000039a05';
insert into public.characters (owner, name, static_id, start_balance, goal_name, goal) values
  ('00000000-0000-0000-0000-000000039a01', 'Adm_Player', 39001, 777777, 'Секретна ціль', 999);

-- щоб адмінів у базі було відомо скільки: решту адмінів з інших тестів на час тесту робимо user, потім повертаємо
create table public.test_admins as select id from public.profiles where role = 'admin' and id <> '00000000-0000-0000-0000-000000039a04';
update public.profiles set role = 'user' where id in (select id from public.test_admins);

-- черги: невідома назва, ціна поза межами
insert into public.buyer_unknown_items (buyer_id, text) values ('hide', 'Шкура тестового звіра'), ('hide', 'Шкура тестового звіра 1'), ('hide', 'Сміття розпізнавання');
select set_config('test.it', (select item_id from public.buyer_items where buyer_id = 'hide' order by item_id offset 2 limit 1)::text, false) as it \gset
update public.buyer_items set min_price = 1000, max_price = 2000 where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint;
insert into public.buyer_limit_reports (buyer_id, item_id, price) values ('hide', current_setting('test.it')::bigint, 640);

create function public.test_try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok';
exception when others then return sqlstate; end $$;
grant execute on function public.test_try(text) to anon, authenticated;

-- 1) anon, user, editor, moderator — відмова на кожну функцію
create function public.test_denied() returns void language plpgsql as $$
declare q text;
begin
  foreach q in array array[
    'select public.admin_queue_counts()',
    'select public.admin_unknown_resolve(1, ''drop'')',
    'select public.admin_limit_resolve(''hide'', 1, ''drop'')',
    'select * from public.admin_price_pending()',
    'select public.admin_price_reject(''hide'', 1, 1)',
    'select public.admin_app_stats()',
    'select * from public.admin_find_accounts(''Adm'')',
    'select public.admin_set_role(''00000000-0000-0000-0000-000000039a01'', ''admin'')',
    'select * from public.admin_training_shots()'] loop
    assert public.test_try(q) in ('42501', '42883'), 'не-адмін пройшов: ' || q || ' → ' || public.test_try(q);
  end loop;
end $$;
grant execute on function public.test_denied() to anon, authenticated;

set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select public.test_denied();
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a01', false) \gset
select public.test_denied();
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a02', false) \gset
select public.test_denied();
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a03', false) \gset
select public.test_denied();
reset role;
do $$ begin
  assert (select count(*) from public.buyer_unknown_items where text like '%тестового%') = 2, 'не-адмін розібрав чергу';
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-000000039a01') = 'user', 'не-адмін змінив роль';
end $$;

-- 2) адмін: черги
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a04', false) \gset
do $$
declare c json; u1 bigint; u2 bigint; u3 bigint; it bigint; newit bigint;
begin
  c := public.admin_queue_counts();
  assert (c->>'unknown')::int >= 3 and (c->>'limits')::int >= 1, 'лічильники черг не ті: ' || c::text;
  select id into u1 from public.buyer_unknown_items where text = 'Шкура тестового звіра';
  select id into u2 from public.buyer_unknown_items where text = 'Шкура тестового звіра 1';
  select id into u3 from public.buyer_unknown_items where text = 'Сміття розпізнавання';

  -- add: новий товар без категорії — відмова, рядок лишається
  assert public.test_try(format('select public.admin_unknown_resolve(%s, ''add'', null, ''Шкура тестового звіра'', ''nope'')', u1)) = '22023', 'товар без категорії пройшов';
  assert exists (select 1 from public.buyer_unknown_items where id = u1), 'відмова з''їла рядок черги';
  perform public.admin_unknown_resolve(u1, 'add', null, 'Шкура тестового звіра', (select category from public.items limit 1));
  select id into newit from public.items where name = 'Шкура тестового звіра';
  assert newit is not null, 'товар не створився';
  assert exists (select 1 from public.buyer_items where buyer_id = 'hide' and item_id = newit), 'товар не додався до скупника';
  assert not exists (select 1 from public.buyer_unknown_items where id = u1), 'рядок черги лишився після add';
  -- той самий рядок удруге — «уже розібрано»
  assert public.test_try(format('select public.admin_unknown_resolve(%s, ''drop'')', u1)) = 'P0002', 'повторний розбір не P0002';

  -- alias: назва з помилкою → псевдонім; повтор у іншому регістрі не дублює
  perform public.admin_unknown_resolve(u2, 'alias', newit);
  assert (select aliases from public.items where id = newit) = array['Шкура тестового звіра 1'], 'псевдонім не дописався';
  perform public.report_unknown_item('hide', 'ШКУРА ТЕСТОВОГО ЗВІРА 1');   -- як надсилає програма
  select id into u2 from public.buyer_unknown_items where text = 'ШКУРА ТЕСТОВОГО ЗВІРА 1';
  perform public.admin_unknown_resolve(u2, 'alias', newit);
  assert cardinality((select aliases from public.items where id = newit)) = 1, 'псевдонім задублювався';

  -- drop: лише прибирає
  perform public.admin_unknown_resolve(u3, 'drop');
  assert not exists (select 1 from public.buyer_unknown_items where id = u3), 'drop не прибрав рядок';

  -- межі: погані — відмова, рядок лишається; добрі — нові межі, рядок прибрано
  it := current_setting('test.it')::bigint;
  assert public.test_try(format('select public.admin_limit_resolve(''hide'', %s, ''fix'', 700, 600)', it)) = '22023', 'min >= max пройшло';
  assert exists (select 1 from public.buyer_limit_reports where buyer_id = 'hide' and item_id = it), 'відмова з''їла рядок меж';
  perform public.admin_limit_resolve('hide', it, 'fix', 600, 2000);
  assert (select min_price from public.buyer_items where buyer_id = 'hide' and item_id = it) = 600, 'межі не оновились';
  assert public.test_try(format('select public.admin_limit_resolve(''hide'', %s, ''drop'')', it)) = 'P0002', 'повторний розбір меж не P0002';
end $$;
reset role;

-- 3) непідтверджена ціна: голос гравця видно адміну з ніком; «Відкинути» прибирає лише його
update public.buyer_items set price = 1500, price_at = now() - interval '1 day' where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a01', false) \gset
insert into public.price_reports (kind, buyer_id, item_id, price, source, character_id)
  values ('buyer', 'hide', current_setting('test.it')::bigint, 1700, 'desktop', (select id from public.characters where name = 'Adm_Player'));
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a04', false) \gset
do $$
declare r record;
begin
  select * into r from public.admin_price_pending() where item_id = current_setting('test.it')::bigint and price = 1700;
  assert r.votes = 1 and r.reporters = array['Adm_User'], 'непідтверджена ціна без автора: ' || coalesce(r::text, 'немає');
  assert public.admin_price_reject('hide', current_setting('test.it')::bigint, 1700) = 1, 'голос не прибрано';
  assert not exists (select 1 from public.admin_price_pending() where item_id = current_setting('test.it')::bigint and price = 1700), 'ціна лишилась у черзі';
  assert public.test_try(format('select public.admin_price_reject(''hide'', %s, 1700)', current_setting('test.it'))) = 'P0002', 'повторне відкидання не P0002';
end $$;
reset role;

-- 4) ролі: пошук без обліку, видача ролі, захист себе й останнього admin
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a04', false) \gset
do $$
declare r record; j text;
begin
  assert public.test_try('select * from public.admin_find_accounts(''A'')') = '22023', 'пошук з 1 символу пройшов';
  select * into r from public.admin_find_accounts('adm_us');
  assert r.nick = 'Adm_User' and r.role = 'user', 'пошук за частиною ніка не знайшов акаунт';
  j := r.characters::text;
  assert j like '%Adm_Player%' and j like '%39001%', 'персонажа немає в картці';
  assert j not like '%777777%' and j not like '%Секретна%' and j not like '%start_balance%' and j not like '%goal%', 'у картці дані обліку: ' || j;
  assert (select count(*) from public.admin_find_accounts('Adm')) <= 20, 'понад 20 результатів';

  assert public.admin_set_role('00000000-0000-0000-0000-000000039a01', 'editor') = 'editor', 'роль не видано';
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-000000039a01') = 'editor', 'роль не записалась';
  perform public.admin_set_role('00000000-0000-0000-0000-000000039a01', 'user');
  assert public.test_try('select public.admin_set_role(''00000000-0000-0000-0000-000000039a01'', ''boss'')') = '22023', 'невідома роль пройшла';
  assert public.test_try('select public.admin_set_role(''00000000-0000-0000-0000-000000039a04'', ''user'')') = '22023', 'адмін зняв роль із себе';
  assert public.test_try('select public.admin_set_role(''00000000-0000-0000-0000-000000039a99'', ''user'')') = '22023', 'неіснуючий акаунт пройшов';
  -- другий адмін: зняти першого можна, поки адмінів двоє; останнього — ні
  perform public.admin_set_role('00000000-0000-0000-0000-000000039a05', 'admin');
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a05', false) \gset
do $$ begin
  perform public.admin_set_role('00000000-0000-0000-0000-000000039a04', 'user');
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-000000039a04') = 'user', 'другий адмін не зняв першого';
  -- 39a05 тепер останній: себе зняти не можна (і як «себе», і як «останнього»)
  assert public.test_try('select public.admin_set_role(''00000000-0000-0000-0000-000000039a05'', ''user'')') = '22023', 'останній адмін зняв роль';
  -- прямий update ролі клієнтом — як і раніше заборонений
  begin update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000039a01'; raise exception 'клієнт змінив роль напряму';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.profiles where role = 'admin' and id::text like '%039a%') = 1, 'адмінів не один';
end $$;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000039a04';

-- 5) стан програми: app_ping з версією і без; сміття — null
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a01', false) \gset
select public.app_ping();
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a02', false) \gset
select public.app_ping('0.6.3');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a03', false) \gset
select public.app_ping('abc');
reset role;
do $$ begin
  assert (select version from public.app_presence where user_id = '00000000-0000-0000-0000-000000039a01') is null, 'app_ping() без версії записав версію';
  assert (select version from public.app_presence where user_id = '00000000-0000-0000-0000-000000039a02') = '0.6.3', 'версію не записано';
  assert (select version from public.app_presence where user_id = '00000000-0000-0000-0000-000000039a03') is null, 'сміття замість версії записано';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a04', false) \gset
do $$
declare s json;
begin
  s := public.admin_app_stats();
  assert (s->>'online_3m')::int >= 3 and (s->>'online_24h')::int >= 3, 'онлайн не рахується: ' || s::text;
  assert s::text like '%"version" : "0.6.3"%' or s::text like '%"version":"0.6.3"%', 'версії 0.6.3 немає в розподілі: ' || s::text;
  assert (s->'ai'->>'limit')::int = 50, 'ліміт ШІ не 50';
  -- у картці акаунта — остання версія
  assert (select version from public.admin_find_accounts('Adm_Editor')) = '0.6.3', 'версії немає в картці акаунта';
end $$;
reset role;

-- 6) знімки: лише .jpg з training, новіші першими, нік автора; порція поза 1–100 — відмова
insert into storage.objects (bucket_id, name, owner, created_at) values
  ('training', '00000000-0000-0000-0000-000000039a01/1000.jpg', '00000000-0000-0000-0000-000000039a01', now() - interval '2 hours'),
  ('training', '00000000-0000-0000-0000-000000039a01/1000.json', '00000000-0000-0000-0000-000000039a01', now() - interval '2 hours'),
  ('training', '00000000-0000-0000-0000-000000039a01/2000.jpg', '00000000-0000-0000-0000-000000039a01', now() - interval '1 hour');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000039a04', false) \gset
do $$
declare names text[];
begin
  select array_agg(name order by created_at desc) into names from public.admin_training_shots() where name like '%039a01%';
  assert names = array['00000000-0000-0000-0000-000000039a01/2000.jpg', '00000000-0000-0000-0000-000000039a01/1000.jpg'], 'знімки не ті: ' || coalesce(names::text, 'немає');
  assert (select nick from public.admin_training_shots() where name like '%039a01/2000%') = 'Adm_User', 'немає ніка автора';
  assert (select count(*) from public.admin_training_shots(now() - interval '90 minutes') where name like '%039a01%') = 1, 'p_before не працює';
  assert public.test_try('select * from public.admin_training_shots(null, 0)') = '22023', 'порція 0 пройшла';
end $$;
reset role;

-- прибрати за собою
delete from storage.objects where name like '00000000-0000-0000-0000-000000039a%';
delete from public.price_reports where reporter::text like '%039a%';
delete from public.buyer_unknown_items where text like '%ТЕСТОВОГО%' or text like '%тестового%';
delete from public.buyer_items where item_id = (select id from public.items where name = 'Шкура тестового звіра');
delete from public.items where name = 'Шкура тестового звіра';
update public.profiles set role = 'admin' where id in (select id from public.test_admins);
drop table public.test_admins;
drop function public.test_denied();
drop function public.test_try(text);

\echo 'Адмін-панель ok'
