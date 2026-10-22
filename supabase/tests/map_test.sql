-- Мапа: мітки бачать усі, додає/видаляє лише адмін; координати в межах штату.
\set ON_ERROR_STOP on
set client_min_messages = warning;
do $$ begin assert (select count(*) from public.map_categories) = 35, 'початкових категорій не 35'; end $$;

set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.map_categories) = 35, 'гість не бачить категорій';
  begin insert into public.map_points (category_id, name, x, y) values ('trash-bins', 'бак', 0, 0); raise exception 'гість додав мітку';
  exception when insufficient_privilege then null; end;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \gset
do $$ begin
  begin insert into public.map_points (category_id, name, x, y) values ('trash-bins', 'бак', 0, 0); raise exception 'гравець додав мітку';
  exception when insufficient_privilege then null; end;
  begin insert into public.map_categories (id, name) values ('mine', 'Моя'); raise exception 'гравець створив категорію';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
insert into public.map_categories (id, name, grp, icon, color) values ('boxes', 'Скрині', 'Інше', '/icons/jobs/treasure.svg', '#22c55e');
insert into public.map_points (category_id, name, x, y) values ('boxes', 'Скриня 1', 100.5, -200), ('trash-bins', 'Бак біля пірсу', -1600, -1000);
do $$ begin
  assert (select count(*) from public.map_points) = 2, 'адмін не додав мітки';
  assert (select created_by from public.map_points where name = 'Скриня 1') = auth.uid(), 'автор мітки не записаний';
  begin insert into public.map_points (category_id, x, y) values ('boxes', 99999, 0); raise exception 'мітку поза мапою прийнято';
  exception when check_violation then null; end;
  begin insert into public.map_categories (id, name, color) values ('bad', 'Погана', 'red'); raise exception 'колір не HEX прийнято';
  exception when check_violation then null; end;
end $$;
delete from public.map_categories where id = 'boxes';
do $$ begin assert (select count(*) from public.map_points) = 1, 'мітки видаленої категорії лишились'; end $$;
reset role;
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-00000000000a';
\echo 'Мапа ok: 35 категорій; бачать усі; гість і гравець нічого не додають; адмін додає категорії й мітки; координати й колір перевіряються; мітки йдуть разом з категорією'
