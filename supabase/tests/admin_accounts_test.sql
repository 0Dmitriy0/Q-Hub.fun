-- «Гравці» в адмін-панелі (0047, specs/039): усі акаунти порціями, фільтр за ніком чи Discord; лише admin; без обліку.
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000047a01', '{"full_name":"ListUserOne"}'),
  ('00000000-0000-0000-0000-000000047a02', '{"full_name":"ListUserTwo"}'),
  ('00000000-0000-0000-0000-000000047a03', '{"full_name":"ListBoss"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user', nick = 'List_One', created_at = now() - interval '2 days' where id = '00000000-0000-0000-0000-000000047a01';
update public.profiles set role = 'moderator', nick = 'List_Two', created_at = now() - interval '1 day' where id = '00000000-0000-0000-0000-000000047a02';
update public.profiles set role = 'admin', nick = 'List_Boss' where id = '00000000-0000-0000-0000-000000047a03';
insert into public.characters (owner, name, static_id, start_balance, goal_name, goal) values
  ('00000000-0000-0000-0000-000000047a01', 'List_Player', 47001, 555555, 'Таємна ціль', 777);

create function public.test_try47(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok';
exception when others then return sqlstate; end $$;
grant execute on function public.test_try47(text) to anon, authenticated;

-- гість, гравець, модератор — відмова
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin assert public.test_try47('select * from public.admin_accounts()') = '42501', 'гість побачив список'; end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000047a01', false) \gset
do $$ begin assert public.test_try47('select * from public.admin_accounts()') = '42501', 'гравець побачив список'; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000047a02', false) \gset
do $$ begin assert public.test_try47('select * from public.admin_accounts()') = '42501', 'модератор побачив список'; end $$;

-- адмін: без запиту — усі, новіші першими; total — скільки всього; фільтр; порції; без обліку
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000047a03', false) \gset
do $$
declare n bigint; t bigint; j text; ids uuid[];
begin
  select count(*), max(total) into n, t from public.admin_accounts('', 0, 100);
  assert t = (select count(*) from public.profiles), 'total не дорівнює кількості акаунтів: ' || t;
  assert n = least(t, 100), 'без запиту видно не всіх';
  select array_agg(id) into ids from public.admin_accounts('list_', 0, 100);
  assert ids = array['00000000-0000-0000-0000-000000047a03', '00000000-0000-0000-0000-000000047a02', '00000000-0000-0000-0000-000000047a01']::uuid[],
    'фільтр чи порядок «новіші першими» не ті: ' || coalesce(ids::text, 'немає');
  assert (select max(total) from public.admin_accounts('list_', 0, 100)) = 3, 'total під фільтром не 3';
  assert (select count(*) from public.admin_accounts('list_', 1, 1)) = 1, 'порція не працює';
  assert (select id from public.admin_accounts('list_', 2, 1)) = '00000000-0000-0000-0000-000000047a01', 'зсув не працює';
  select characters::text into j from public.admin_accounts('List_One', 0, 10);
  assert j like '%List_Player%' and j like '%47001%', 'персонажа немає';
  assert j not like '%555555%' and j not like '%Таємна%' and j not like '%goal%' and j not like '%start_balance%', 'у списку дані обліку: ' || j;
  assert public.test_try47('select * from public.admin_accounts('''', 0, 0)') = '22023', 'порція 0 пройшла';
  assert public.test_try47('select * from public.admin_accounts('''', -1, 10)') = '22023', 'від''ємний зсув пройшов';
end $$;
reset role;

delete from public.characters where name = 'List_Player';
drop function public.test_try47(text);

\echo 'Адмінка: усі акаунти ok'
