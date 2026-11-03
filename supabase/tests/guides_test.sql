-- Інструкції (0035, specs/023): неопубліковану бачить лише admin, без дати перевірки не публікується, пише лише admin.
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000fb', '{"full_name":"GuideEditor"}'),
  ('00000000-0000-0000-0000-0000000000fc', '{"full_name":"GuideAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-0000000000fb';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000fc';

-- гість: чернетку не бачить
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin assert (select count(*) from public.guides) = 0, 'гість бачить неопубліковану інструкцію'; end $$;
reset role;

-- редактор: не пише
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000fb', false) \gset
update public.guides set install = 'зламано' where slug = 'game-map';
reset role;
do $$ begin assert (select install = '' from public.guides where slug = 'game-map'), 'редактор змінив інструкцію'; end $$;

-- адмін: пише; без дати перевірки опублікувати не можна, з датою — можна, і гість бачить
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000fc', false) \gset
do $$ begin
  update public.guides set install = 'Крок 1' where slug = 'game-map';
  begin update public.guides set published = true where slug = 'game-map'; raise exception 'опубліковано без дати перевірки';
  exception when check_violation then null; end;
  update public.guides set published = true, checked_on = '2026-10-29' where slug = 'game-map';
end $$;
reset role;
set role anon;
do $$ begin assert (select install = 'Крок 1' from public.guides where slug = 'game-map'), 'гість не бачить опубліковану інструкцію'; end $$;
reset role;
update public.guides set install = '', published = false, checked_on = null where slug = 'game-map';

\i supabase/migrations/0035_guides.sql
do $$ begin assert (select count(*) from public.guides where slug = 'game-map') = 1, 'повторний запуск дублює інструкцію'; end $$;
\echo 'Інструкції ok'
