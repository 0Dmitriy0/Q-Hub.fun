-- Автор мітки (0061): нік автора чернетки Alt+F9 чи пропозиції в довідник; без ніку, сховану чи неопубліковану партію
-- не видно; гість читає. Запуск: supabase/tests/run.sh (після map_drafts_test.sql і wiki-тестів)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', '{"full_name":"Discord Name"}'),
  ('00000000-0000-0000-0000-0000000000e2', '{"full_name":"No Nick"}')
  on conflict (id) do nothing;
update public.profiles set nick = 'Kartohraf' where id = '00000000-0000-0000-0000-0000000000e1';
insert into public.map_categories (id, name) values ('authors-test', 'Тест авторів') on conflict (id) do nothing;

do $$
declare p1 bigint; p2 bigint; p3 bigint; p4 bigint; p5 bigint; b bigint;
begin
  -- чернетка з ніком, чернетка без ніку, пропозиція в довідник, сховану, у неопублікованій партії
  insert into public.map_points (category_id, name, x, y) values ('authors-test', 'a', 1, 1) returning id into p1;
  insert into public.map_points (category_id, name, x, y) values ('authors-test', 'b', 2, 2) returning id into p2;
  insert into public.map_points (category_id, name, x, y) values ('authors-test', 'c', 3, 3) returning id into p3;
  insert into public.map_points (category_id, name, x, y, hidden) values ('authors-test', 'd', 4, 4, true) returning id into p4;
  insert into public.map_batches (category_id, source) values ('authors-test', 'game') returning id into b;
  insert into public.map_points (category_id, name, x, y, batch_id) values ('authors-test', 'e', 5, 5, b) returning id into p5;
  insert into public.map_drafts (id, author, taken_at, shot, status, point_id, reviewed_at) values
    ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', now(), 'e/1.jpg', 'published', p1, now()),
    ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e2', now(), 'e/2.jpg', 'published', p2, now()),
    ('e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e1', now(), 'e/4.jpg', 'published', p4, now()),
    ('e0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000e1', now(), 'e/5.jpg', 'published', p5, now());
  insert into public.wiki_versions (section, target_id, version_no, data, kind, author)
    values ('map_point', p3::text, 1, '{}', 'accept', '00000000-0000-0000-0000-0000000000e1');
  perform set_config('test.p', format('%s,%s,%s,%s,%s', p1, p2, p3, p4, p5), false);
end $$;

set role anon;
do $$
declare p bigint[] := string_to_array(current_setting('test.p'), ',')::bigint[];
begin
  assert (select name from public.map_point_authors where point_id = p[1]) = 'Kartohraf', 'нік автора чернетки не видно';
  assert not exists (select 1 from public.map_point_authors where point_id = p[2]), 'без ніку видно ім''я з Discord';
  assert (select name from public.map_point_authors where point_id = p[3]) = 'Kartohraf', 'автора пропозиції не видно';
  assert not exists (select 1 from public.map_point_authors where point_id = p[4]), 'видно автора схованої мітки';
  assert not exists (select 1 from public.map_point_authors where point_id = p[5]), 'видно автора неопублікованої партії';
end $$;
reset role;
delete from public.map_categories where id = 'authors-test';
\echo 'Автори міток ok'
