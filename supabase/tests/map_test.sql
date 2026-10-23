-- Мапа: мітки бачать усі, додає/видаляє лише адмін; координати в межах штату.
\set ON_ERROR_STOP on
set client_min_messages = warning;
do $$ begin assert (select count(*) from public.map_categories) = 38, 'початкових категорій не 38'; end $$;

set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.map_categories) = 38, 'гість не бачить категорій';
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
-- власник бізнесу: статік на мітці, нік з профілю видно на мапі (а пошта й інше — ні)
update public.map_points set owner_static = 777 where name = 'Бак біля пірсу';
do $$ begin
  assert (select owner_static from public.map_points where name = 'Бак біля пірсу') = 777, 'власник не записався';
  begin update public.map_points set owner_static = 0 where name = 'Скриня 1'; raise exception 'статік 0 прийнято';
  exception when check_violation then null; end;
end $$;
-- своя іконка мітки: шлях до іконки сайту або https, без лапок і HTML
update public.map_points set icon = '/icons/map/gang-green.svg' where name = 'Бак біля пірсу';
do $$ begin
  assert (select icon from public.map_points where name = 'Бак біля пірсу') = '/icons/map/gang-green.svg', 'іконка мітки не записалась';
  assert (select show_label from public.map_points where name = 'Бак біля пірсу'), 'назва мітки за замовчуванням не показується';
  begin update public.map_points set icon = 'javascript:alert(1)' where name = 'Скриня 1'; raise exception 'погану іконку прийнято';
  exception when check_violation then null; end;
  begin update public.map_points set icon = '/icons/x.svg" onerror="x' where name = 'Скриня 1'; raise exception 'іконку з лапками прийнято';
  exception when check_violation then null; end;
end $$;
delete from public.map_categories where id = 'boxes';
do $$ begin assert (select count(*) from public.map_points) = 1, 'мітки видаленої категорії лишились'; end $$;
reset role;
set role anon;
do $$ begin
  assert (select count(*) from public.map_owners) = 1, 'власника не видно гостю';
  assert (select static_id from public.map_owners) = 777, 'не той статік власника';
end $$;
reset role;
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-00000000000a';
\echo 'Мапа ok: 38 категорій; бачать усі; гість і гравець нічого не додають; адмін додає категорії й мітки; координати й колір перевіряються; мітки йдуть разом з категорією; власника бізнесу видно за статіком; мітка може мати свою іконку і ховати назву'
