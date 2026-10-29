-- Партії міток (0033, specs/017): імпорт лише admin, дублі ближче 10 м і точки поза мапою пропускаються,
-- неопубліковану партію бачить лише admin, відкат прибирає лише мітки партії. Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f9', '{"full_name":"BatchEditor"}'),
  ('00000000-0000-0000-0000-0000000000fa', '{"full_name":"BatchAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-0000000000f9';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000fa';

do $$ begin assert (select grp = 'Івенти' from public.map_categories where id = 'harbuzy'), 'гарбузи не в папці «Івенти»'; end $$;
insert into public.map_points (category_id, name, x, y) values ('harbuzy', 'Окремий гарбуз', 100, 100);

-- редактор (не admin): імпорт заборонено
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f9', false) \gset
do $$ begin
  begin perform public.import_map_batch('harbuzy', 'ohm', '[{"x":1,"y":1}]'); raise exception 'редактор імпортував партію';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- адмін: 5 точок — дубль іншої з цього ж списку (4 м), за 5 м від наявної, поза мапою; додаються 2
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000fa', false) \gset
select set_config('test.r', public.import_map_batch('harbuzy', 'ohm',
  '[{"x":-323,"y":959,"name":"Гарбуз"},{"x":-323,"y":963},{"x":103,"y":104},{"x":9000,"y":0},{"x":500,"y":500}]')::text, false) as r \gset
reset role;
do $$ declare r jsonb := current_setting('test.r')::jsonb; b bigint := (r ->> 'batch')::bigint; begin
  assert (r ->> 'added')::int = 2 and (r ->> 'skipped')::int = 2 and (r ->> 'outside')::int = 1, 'підсумок імпорту не 2/2/1: ' || r::text;
  assert (select count = 2 from public.map_batches where id = b), 'у партії не 2 мітки';
  assert (select count(*) from public.map_points where batch_id = b and source = 'ohm') = 2, 'мітки без партії чи без джерела';
  perform set_config('test.batch', b::text, false);
end $$;

-- гість: неопубліковану партію не бачить, окрему мітку — бачить
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.map_points where category_id = 'harbuzy') = 1, 'гість бачить неопубліковану партію';
  assert (select count(*) from public.map_batches) = 0, 'гість читає партії';
end $$;
reset role;

-- адмін публікує — гість бачить
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000fa', false) \gset
update public.map_batches set published = true where id = current_setting('test.batch')::bigint;
reset role;
set role anon;
do $$ begin assert (select count(*) from public.map_points where category_id = 'harbuzy') = 3, 'гість не бачить опубліковану партію'; end $$;
reset role;

-- редактор не відкочує; адмін відкочує — зникають лише мітки партії
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f9', false) \gset
delete from public.map_batches;
reset role;
do $$ begin assert (select count(*) from public.map_batches where id = current_setting('test.batch')::bigint) = 1, 'редактор відкотив партію'; end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000fa', false) \gset
delete from public.map_batches where id = current_setting('test.batch')::bigint;
reset role;
do $$ begin assert (select count(*) from public.map_points where category_id = 'harbuzy') = 1, 'відкат прибрав не лише мітки партії'; end $$;
delete from public.map_points where category_id = 'harbuzy';

\i supabase/migrations/0033_map_batches_events.sql
do $$ begin assert (select count(*) from public.map_categories where id = 'harbuzy') = 1, 'повторний запуск дублює категорію'; end $$;
\echo 'Партії міток ok'
