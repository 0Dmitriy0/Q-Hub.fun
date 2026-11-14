-- Назви міток — галочка категорії (0067, specs/081): за замовчуванням false; змінює лише admin, гість, user, editor
-- і moderator — ні. Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000c81', '{"full_name":"Labels User"}'),
  ('00000000-0000-0000-0000-000000000c82', '{"full_name":"Labels Editor"}'),
  ('00000000-0000-0000-0000-000000000c83', '{"full_name":"Labels Moderator"}'),
  ('00000000-0000-0000-0000-000000000c84', '{"full_name":"Labels Admin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-000000000c81';
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-000000000c82';
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-000000000c83';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000c84';

insert into public.map_categories (id, name, grp, icon, sort, shown) values ('labels-test', 'Тест назв', 'Інше', '', 999, true)
  on conflict (id) do update set show_labels = false;

do $$ begin
  assert (select show_labels from public.map_categories where id = 'labels-test') = false, 'нова категорія не з show_labels = false';
  assert (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'map_categories' and column_name = 'show_labels') = 'false', 'show_labels не за замовчуванням false';
end $$;

-- гість: оновлення не проходить (RLS — 0 рядків)
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
update public.map_categories set show_labels = true where id = 'labels-test';
reset role;
do $$ begin assert (select show_labels from public.map_categories where id = 'labels-test') = false, 'гість увімкнув назви'; end $$;

-- user, editor, moderator: так само
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c81', false) \gset
update public.map_categories set show_labels = true where id = 'labels-test';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c82', false) \gset
update public.map_categories set show_labels = true where id = 'labels-test';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c83', false) \gset
update public.map_categories set show_labels = true where id = 'labels-test';
reset role;
do $$ begin assert (select show_labels from public.map_categories where id = 'labels-test') = false, 'user, editor чи moderator увімкнув назви'; end $$;

-- admin: змінює
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c84', false) \gset
update public.map_categories set show_labels = true where id = 'labels-test';
reset role;
do $$ begin assert (select show_labels from public.map_categories where id = 'labels-test') = true, 'admin не зміг увімкнути назви'; end $$;

delete from public.map_categories where id = 'labels-test';
