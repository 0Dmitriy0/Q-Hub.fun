-- Фото мітки (0052): змінює лише admin; editor, user і гість — ні; адреса — лише https без лапок і пробілів.
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000005521', '{"full_name":"PhotoEditor"}'),
  ('00000000-0000-0000-0000-000000005522', '{"full_name":"PhotoAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-000000005521';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000005522';
insert into public.map_categories (id, name, grp) values ('photo-test', 'Фото тест', 'Івенти') on conflict (id) do nothing;
insert into public.map_points (category_id, name, x, y) values ('photo-test', 'Привид з фото', 10, 10);
select id as pt from public.map_points where category_id = 'photo-test' \gset

do $$ begin assert (select photo_url = '' from public.map_points where category_id = 'photo-test'), 'нова мітка не з порожнім фото'; end $$;

-- гість і редактор: не змінюють
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
update public.map_points set photo_url = 'https://x.test/anon.webp' where id = :pt;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005521', false) \gset
update public.map_points set photo_url = 'https://x.test/editor.webp' where id = :pt;
reset role;
do $$ begin assert (select photo_url = '' from public.map_points where category_id = 'photo-test'), 'фото змінив не admin'; end $$;

-- admin: змінює; гість бачить
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005522', false) \gset
update public.map_points set photo_url = 'https://x.test/map/1.webp' where id = :pt;
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin assert (select photo_url = 'https://x.test/map/1.webp' from public.map_points where category_id = 'photo-test'), 'гість не бачить фото'; end $$;
reset role;

-- адреса: лише https, без пробілів і лапок
do $$ begin
  begin update public.map_points set photo_url = 'http://x.test/a.webp' where category_id = 'photo-test'; raise exception 'http пройшов';
  exception when check_violation then null; end;
  begin update public.map_points set photo_url = 'https://x.test/a" onerror="x' where category_id = 'photo-test'; raise exception 'лапки пройшли';
  exception when check_violation then null; end;
end $$;

delete from public.map_categories where id = 'photo-test';
select 'map_photos ok';
