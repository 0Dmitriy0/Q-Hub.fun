-- Зони на мапі (0021): бачать усі, малює й видаляє лише адмін; контур — 3–500 точок у межах мапи. Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- свій адмін і гравець (інші тести вже створюють a, b, c, d, c1, d1)
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a2', '{"full_name":"AreaAdmin"}'),
  ('00000000-0000-0000-0000-0000000000b2', '{"full_name":"AreaUser"}')
  on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000000b2';
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin assert (select shown = false and grp = 'Заробіток' from public.map_categories where id = 'treasure-fields'), 'категорії полів скарбів немає'; end $$;

-- адмін малює зону
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false) \gset
insert into public.map_areas (category_id, name, ring) values ('treasure-fields', 'Пляж аеропорту', '[[-1500,-3300],[-1000,-3400],[-900,-3100]]');
do $$ begin
  assert (select created_by from public.map_areas where name = 'Пляж аеропорту') = auth.uid(), 'автор зони не записаний';
  begin insert into public.map_areas (category_id, ring) values ('treasure-fields', '[[0,0],[1,1]]'); raise exception 'зону з 2 точок прийнято';
  exception when check_violation then null; end;
  begin insert into public.map_areas (category_id, ring) values ('treasure-fields', '[[0,0],[1,1],[99999,0]]'); raise exception 'точку поза мапою прийнято';
  exception when check_violation then null; end;
  begin insert into public.map_areas (category_id, ring) values ('treasure-fields', '[[0,0],[1,1],["a",2]]'); raise exception 'не число прийнято';
  exception when check_violation then null; end;
  begin insert into public.map_areas (category_id, ring) values ('treasure-fields', '{"x":1}'); raise exception 'не масив прийнято';
  exception when check_violation then null; end;
end $$;
reset role;

-- гість бачить, не змінює
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.map_areas) = 1, 'гість не бачить зону';
  begin insert into public.map_areas (category_id, ring) values ('treasure-fields', '[[0,0],[1,1],[2,0]]'); raise exception 'гість додав зону';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- гравець і редактор бачать, не змінюють і не видаляють
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false) \gset
do $$ begin
  assert (select count(*) from public.map_areas) = 1, 'гравець не бачить зону';
  begin insert into public.map_areas (category_id, ring) values ('treasure-fields', '[[0,0],[1,1],[2,0]]'); raise exception 'гравець додав зону';
  exception when insufficient_privilege then null; end;
  update public.map_areas set name = 'зламано';
  delete from public.map_areas;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
do $$ begin
  begin insert into public.map_areas (category_id, ring) values ('treasure-fields', '[[0,0],[1,1],[2,0]]'); raise exception 'редактор додав зону';
  exception when insufficient_privilege then null; end;
  delete from public.map_areas;
end $$;
reset role;
do $$ begin assert (select count(*) from public.map_areas where name = 'Пляж аеропорту') = 1, 'не-адмін змінив або видалив зону'; end $$;

-- адмін видаляє; видалили категорію — зони йдуть разом з нею
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false) \gset
insert into public.map_categories (id, name) values ('areas-test', 'Тест зон');
insert into public.map_areas (category_id, ring) values ('areas-test', '[[0,0],[10,0],[0,10]]');
delete from public.map_areas where name = 'Пляж аеропорту';
delete from public.map_categories where id = 'areas-test';
do $$ begin assert (select count(*) from public.map_areas) = 0, 'зони не видалились'; end $$;
reset role;
\echo 'Зони ok: бачать усі; гість, гравець і редактор не додають, не змінюють і не видаляють; контур 3–500 точок у межах мапи; зони йдуть разом з категорією'
