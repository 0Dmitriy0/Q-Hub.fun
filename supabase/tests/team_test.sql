-- «Команда Q-Hub» (0062): склад змінює лише admin, читають усі; персонажа відкриває лише власник;
-- гість бачить нік, підпис і лише відкритих персонажів; без ніку людини немає. Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000f71', '{"full_name":"Team One"}'),
  ('00000000-0000-0000-0000-000000000f72', '{"full_name":"Team No Nick"}'),
  ('00000000-0000-0000-0000-000000000f73', '{"full_name":"Team Admin"}')
  on conflict (id) do nothing;
update public.profiles set nick = 'TeamNick71' where id = '00000000-0000-0000-0000-000000000f71' and nick is null;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000f73';
insert into public.characters (owner, name, static_id) values
  ('00000000-0000-0000-0000-000000000f71', 'Open_Char', 771001),
  ('00000000-0000-0000-0000-000000000f71', 'Hidden_Char', 771002);

-- гравець не додає себе в команду
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000f71', false) \gset
do $$ begin
  begin insert into public.team_members (user_id, title) values (auth.uid(), 'Я сам'); raise exception 'гравець додав себе в команду';
  exception when insufficient_privilege then null; end;
end $$;
-- власник відкриває одного свого персонажа
update public.characters set team_public = true where name = 'Open_Char';
reset role;

-- admin додає обох
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000f73', false) \gset
insert into public.team_members (user_id, title, sort) values
  ('00000000-0000-0000-0000-000000000f71', 'Засновник', 1),
  ('00000000-0000-0000-0000-000000000f72', 'Модератор', 2);
-- admin не відкриває чужого персонажа (політика «свої персонажі»)
update public.characters set team_public = true where name = 'Hidden_Char';
reset role;

set role anon;
do $$ begin
  assert (select count(*) from public.team where name = 'TeamNick71') = 1, 'учасника з ніком не видно';
  assert (select title from public.team where name = 'TeamNick71') = 'Засновник', 'підпис не той';
  assert (select characters from public.team where name = 'TeamNick71') = '[{"name": "Open_Char", "static": 771001}]'::jsonb, 'видно не лише відкритого персонажа';
  assert not exists (select 1 from public.team where name = 'Team No Nick'), 'без ніку видно ім''я з Discord';
  assert (select count(*) from public.team_members) >= 2, 'гість не читає склад';
end $$;
reset role;
delete from public.team_members where user_id in ('00000000-0000-0000-0000-000000000f71', '00000000-0000-0000-0000-000000000f72');
\echo 'Команда ok'
