-- Написи на мапі (0070, specs/089): бачать усі; додає, змінює й видаляє лише admin; межі полів. Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a4', '{"full_name":"LabelAdmin"}'),
  ('00000000-0000-0000-0000-0000000000b4', '{"full_name":"LabelUser"}')
  on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a4';
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000000b4';
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-00000000000a';

-- адмін ставить напис; межі полів
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false) \gset
insert into public.map_labels (text, x, y, color, font, weight, outline_color, outline_w, angle, size)
  values ('ФЕРМА', 2100, 4900, '#facc15', 'oswald', 600, '#000000', 4, 30, 60);
do $$
declare bad text[] := array[
  $q$insert into public.map_labels (text, x, y) values ('', 0, 0)$q$,
  $q$insert into public.map_labels (text, x, y) values ('   ', 0, 0)$q$,
  $q$insert into public.map_labels (text, x, y) values (repeat('я', 41), 0, 0)$q$,
  $q$insert into public.map_labels (text, x, y) values (E'два\nрядки', 0, 0)$q$,
  $q$insert into public.map_labels (text, x, y, color) values ('A', 0, 0, 'red')$q$,
  $q$insert into public.map_labels (text, x, y, outline_color) values ('A', 0, 0, '#FFF')$q$,
  $q$insert into public.map_labels (text, x, y, font) values ('A', 0, 0, 'Roboto Condensed')$q$,
  $q$insert into public.map_labels (text, x, y, size) values ('A', 0, 0, 4)$q$,
  $q$insert into public.map_labels (text, x, y, size) values ('A', 0, 0, 401)$q$,
  $q$insert into public.map_labels (text, x, y, angle) values ('A', 0, 0, 181)$q$,
  $q$insert into public.map_labels (text, x, y, weight) values ('A', 0, 0, 750)$q$,
  $q$insert into public.map_labels (text, x, y, outline_w) values ('A', 0, 0, 21)$q$,
  $q$insert into public.map_labels (text, x, y) values ('A', 99999, 0)$q$];
  s text;
begin
  assert (select created_by from public.map_labels where text = 'ФЕРМА') = auth.uid(), 'автор напису не записаний';
  assert (select font = 'oswald' and weight = 600 and angle = 30 and size = 60 from public.map_labels where text = 'ФЕРМА'), 'поля напису не ті';
  foreach s in array bad loop
    begin execute s; raise exception 'прийнято: %', s;
    exception when check_violation then null; end;
  end loop;
  update public.map_labels set angle = -45, size = 80 where text = 'ФЕРМА';
  assert (select angle = -45 and size = 80 and updated_at >= created_at from public.map_labels where text = 'ФЕРМА'), 'адмін не змінив напис';
end $$;
reset role;

-- гість бачить, не змінює
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.map_labels where text = 'ФЕРМА') = 1, 'гість не бачить напис';
  begin insert into public.map_labels (text, x, y) values ('ГІСТЬ', 0, 0); raise exception 'гість додав напис';
  exception when insufficient_privilege then null; end;
  begin update public.map_labels set text = 'зламано'; exception when insufficient_privilege then null; end;
  begin delete from public.map_labels; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- гравець і редактор бачать, не змінюють
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b4', false) \gset
do $$ begin
  assert (select count(*) from public.map_labels where text = 'ФЕРМА') = 1, 'гравець не бачить напис';
  begin insert into public.map_labels (text, x, y) values ('ГРАВЕЦЬ', 0, 0); raise exception 'гравець додав напис';
  exception when insufficient_privilege then null; end;
  update public.map_labels set text = 'зламано';
  delete from public.map_labels;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
do $$ begin
  begin insert into public.map_labels (text, x, y) values ('РЕДАКТОР', 0, 0); raise exception 'редактор додав напис';
  exception when insufficient_privilege then null; end;
  update public.map_labels set text = 'зламано';
  delete from public.map_labels;
end $$;
reset role;
do $$ begin assert (select count(*) from public.map_labels where text = 'ФЕРМА') = 1, 'не-адмін змінив або видалив напис'; end $$;

-- адмін видаляє
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false) \gset
delete from public.map_labels where text = 'ФЕРМА';
do $$ begin assert (select count(*) from public.map_labels) = 0, 'адмін не видалив напис'; end $$;
reset role;
\echo 'Написи мапи ok: бачать усі; гість, гравець і редактор не змінюють; адмін додає, змінює, видаляє; межі полів'
