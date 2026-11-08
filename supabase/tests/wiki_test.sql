-- Довідник від гравців (0057, specs/043): гравець лише пропонує, публікують admin і moderator функцією wiki_decide;
-- прямий запис jobs і vehicles — лише admin; ліміт, заборона, білий список полів, конфлікт версій, відкат, приватні скріни.
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', '{"full_name":"Gravets"}'),
  ('00000000-0000-0000-0000-0000000000e2', '{"full_name":"Inshyi"}'),
  ('00000000-0000-0000-0000-0000000000e3', '{"full_name":"Redaktor"}'),
  ('00000000-0000-0000-0000-0000000000e4', '{"full_name":"Moderator"}'),
  ('00000000-0000-0000-0000-0000000000e5', '{"full_name":"Admin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user' where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
-- нік змінюють раз на 30 днів (0038) — у тесті відсуваємо попередню зміну
update public.profiles set nick_changed_at = now() - interval '1 year' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set nick = 'Gravets_Nick' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-0000000000e3';
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-0000000000e4';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000e5';
insert into public.vehicles (name, kind, price) values ('Wiki Test Car', 'auto', 1000) on conflict (name) do nothing;

do $$ begin
  assert (select count(*) from public.jobs) >= 30, 'роботи не перенесено з src/data/jobs.ts';
  assert (select level from public.jobs where id = 'akvanavt') = 7, 'дані «Акванавта» не ті';
end $$;

-- ---------- гість ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.jobs where id = 'akvanavt') = 1, 'гість не бачить роботи';
  begin insert into public.wiki_proposals (section, target_id, kind, data, source) values ('job', 'akvanavt', 'edit', '{"pay":"x"}', 'game');
    raise exception 'гість подав пропозицію';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- гравець e1: пропонує, але не публікує ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \gset
insert into public.wiki_proposals (id, section, target_id, kind, data, source, source_note)
  values ('e1000000-0000-0000-0000-000000000001', 'job', 'akvanavt', 'edit', '{"pay":"1000 $ за замовлення"}', 'game', 'перевірив 05.11');
insert into public.wiki_proposals (id, section, target_id, kind, data, source)
  values ('e1000000-0000-0000-0000-000000000002', 'job', 'akvanavt', 'edit', '{"level":8}', 'game');
do $$ begin
  assert (select status = 'pending' and base_version = 1 and author = auth.uid() from public.wiki_proposals where id = 'e1000000-0000-0000-0000-000000000001'),
    'пропозиція не pending, без версії чи не від автора';
  assert (select pay from public.jobs where id = 'akvanavt') <> '1000 $ за замовлення', 'пропозиція змінила картку без рішення';
  -- одразу прийняту пропозицію не вставиш
  begin insert into public.wiki_proposals (section, target_id, kind, data, source, status, decided_at) values ('job', 'akvanavt', 'edit', '{}', 'game', 'accepted', now());
    raise exception 'прийняту пропозицію вставлено';
  exception when insufficient_privilege then null; end;
  -- від чужого імені
  begin insert into public.wiki_proposals (section, target_id, kind, data, source, author) values ('job', 'akvanavt', 'edit', '{}', 'game', '00000000-0000-0000-0000-0000000000e2');
    raise exception 'пропозицію від чужого імені прийнято';
  exception when insufficient_privilege then null; end;
  -- поля поза білим списком
  begin insert into public.wiki_proposals (section, target_id, kind, data, source) values ('job', 'akvanavt', 'edit', '{"forum":true}', 'game');
    raise exception 'jobs.forum прийнято';
  exception when sqlstate 'QH003' then null; end;
  begin insert into public.wiki_proposals (section, target_id, kind, data, source)
    select 'vehicle', id::text, 'edit', '{"image_url":"https://x/y.png"}', 'game' from public.vehicles where name = 'Wiki Test Car';
    raise exception 'vehicles.image_url прийнято';
  exception when sqlstate 'QH003' then null; end;
  begin insert into public.wiki_proposals (section, target_id, kind, data, source) values ('job', 'akvanavt', 'edit', '{"level":500}', 'game');
    raise exception 'рівень 500 прийнято';
  exception when sqlstate 'QH003' then null; end;
  -- нова робота без адреси
  begin insert into public.wiki_proposals (section, kind, data, source) values ('job', 'new', '{"name":"Пілот"}', 'game');
    raise exception 'нова робота без адреси прийнята';
  exception when sqlstate 'QH003' then null; end;
  -- напряму картку не змінити
  update public.jobs set pay = 'вандалізм' where id = 'akvanavt';
  assert (select pay from public.jobs where id = 'akvanavt') <> 'вандалізм', 'гравець змінив роботу напряму';
  update public.vehicles set price = 1 where name = 'Wiki Test Car';
  assert (select price from public.vehicles where name = 'Wiki Test Car') = 1000, 'гравець змінив авто напряму';
  -- публікувати не може
  begin perform public.wiki_decide('e1000000-0000-0000-0000-000000000001', 'accept'); raise exception 'гравець прийняв пропозицію';
  exception when sqlstate 'QH010' then null; end;
  -- свою пропозицію змінити не може, лише відкликати
  begin update public.wiki_proposals set data = '{"pay":"інше"}' where id = 'e1000000-0000-0000-0000-000000000001'; raise exception 'автор змінив пропозицію';
  exception when sqlstate 'QH010' then null; end;
  begin update public.wiki_proposals set status = 'accepted', decided_at = now() where id = 'e1000000-0000-0000-0000-000000000001'; raise exception 'автор сам прийняв';
  exception when sqlstate 'QH010' then null; end;
  -- скрін — лише у свою теку
  insert into storage.objects (bucket_id, name, owner) values ('wiki-proof', '00000000-0000-0000-0000-0000000000e1/e1000000-0000-0000-0000-000000000001.webp', auth.uid());
  begin insert into storage.objects (bucket_id, name, owner) values ('wiki-proof', '00000000-0000-0000-0000-0000000000e2/x.webp', auth.uid());
    raise exception 'скрін у чужу теку';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- інший гравець e2: не бачить чужих пропозицій і скрінів ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false) \gset
do $$ begin
  assert (select count(*) from public.wiki_proposals where author = '00000000-0000-0000-0000-0000000000e1') = 0, 'гравець бачить чужі пропозиції';
  assert (select count(*) from storage.objects where bucket_id = 'wiki-proof') = 0, 'гравець бачить чужий скрін';
end $$;
reset role;

-- ---------- editor e3: теж лише пропонує, авто напряму не змінює ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', false) \gset
do $$ begin
  update public.vehicles set price = 2 where name = 'Wiki Test Car';
  assert (select price from public.vehicles where name = 'Wiki Test Car') = 1000, 'editor змінив авто напряму';
  begin perform public.wiki_decide('e1000000-0000-0000-0000-000000000001', 'accept'); raise exception 'editor прийняв пропозицію';
  exception when sqlstate 'QH010' then null; end;
end $$;
reset role;

-- ---------- moderator e4: бачить усе, приймає, ловить конфлікт, відхиляє з причиною, відкочує ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', false) \gset
do $$ declare r jsonb; begin
  assert (select count(*) from public.wiki_proposals where author = '00000000-0000-0000-0000-0000000000e1') = 2, 'модератор не бачить пропозиції';
  assert (select count(*) from storage.objects where bucket_id = 'wiki-proof') = 1, 'модератор не бачить скрін-доказ';
  r := public.wiki_decide('e1000000-0000-0000-0000-000000000001', 'accept');
  assert r ->> 'status' = 'accepted', 'статус не accepted';
  assert (select pay = '1000 $ за замовлення' and version = 2 and updated_by = '00000000-0000-0000-0000-0000000000e1' from public.jobs where id = 'akvanavt'),
    'картку не оновлено або автор не записався';
  assert (select count(*) from public.wiki_versions where section = 'job' and target_id = 'akvanavt') = 2, 'історія: немає початкової версії і правки';
  -- друга пропозиція писалась до версії 1 — конфлікт
  assert (select status from public.wiki_proposals where id = 'e1000000-0000-0000-0000-000000000002') = 'conflict', 'друга пропозиція не стала конфліктом';
  begin perform public.wiki_decide('e1000000-0000-0000-0000-000000000002', 'accept'); raise exception 'конфлікт прийнято без підтвердження';
  exception when sqlstate 'QH013' then null; end;
  r := public.wiki_decide('e1000000-0000-0000-0000-000000000002', 'accept', '{"level":9}', '', true);
  assert r ->> 'status' = 'accepted_edited', 'правка модератора не позначена';
  assert (select level = 9 and version = 3 from public.jobs where id = 'akvanavt'), 'прийняття поверх нової версії не спрацювало';
  -- вдруге не розглянеш
  begin perform public.wiki_decide('e1000000-0000-0000-0000-000000000001', 'accept'); raise exception 'розглянуто двічі';
  exception when sqlstate 'QH012' then null; end;
  -- відкат до версії 1 — нова версія, історія не зменшується
  r := public.wiki_revert('job', 'akvanavt', 1, 'вандалізм');
  assert (select level = 7 and pay <> '1000 $ за замовлення' and version = 4 from public.jobs where id = 'akvanavt'), 'відкат не повернув дані';
  assert (select count(*) from public.wiki_versions where section = 'job' and target_id = 'akvanavt') = 4, 'відкат не записався в історію';
  begin perform public.wiki_revert('job', 'akvanavt', 99, 'x'); raise exception 'відкат до неіснуючої версії';
  exception when sqlstate 'QH014' then null; end;
  -- модератор напряму картку теж не змінює
  update public.jobs set pay = 'напряму' where id = 'akvanavt';
  assert (select pay from public.jobs where id = 'akvanavt') <> 'напряму', 'модератор змінив роботу напряму';
end $$;
reset role;

-- ---------- гравець e1: відхилення, ліміт, заборона, нова сторінка, прибрати ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \gset
insert into public.wiki_proposals (id, section, kind, data, source)
  values ('e1000000-0000-0000-0000-000000000003', 'job', 'new', '{"id":"pilot","name":"Пілот","level":5,"tips":["Літай обережно"]}', 'game');
insert into public.wiki_proposals (id, section, target_id, kind, source, source_note)
  values ('e1000000-0000-0000-0000-000000000004', 'job', 'bus', 'hide', 'game', 'роботу прибрали з гри');
do $$ begin
  assert (select count(*) from public.wiki_proposals where author = auth.uid() and decided_at is not null and seen_at is null) = 2, 'рішення не видно автору';
  perform public.wiki_seen();
  assert (select count(*) from public.wiki_proposals where author = auth.uid() and seen_at is null and decided_at is not null) = 0, 'wiki_seen не позначив';
  update public.wiki_proposals set status = 'withdrawn' where id = 'e1000000-0000-0000-0000-000000000004';
  assert (select status from public.wiki_proposals where id = 'e1000000-0000-0000-0000-000000000004') = 'withdrawn', 'автор не відкликав';
end $$;
reset role;
update public.wiki_settings set max_pending = 2;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \gset
insert into public.wiki_proposals (section, target_id, kind, data, source) values ('job', 'taxi', 'edit', '{"pay":"a"}', 'game');
do $$ begin
  begin insert into public.wiki_proposals (section, target_id, kind, data, source) values ('job', 'taxi', 'edit', '{"pay":"b"}', 'game');
    raise exception 'ліміт пропозицій не спрацював';
  exception when sqlstate 'QH002' then null; end;
end $$;
reset role;
update public.wiki_settings set max_pending = 10;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', false) \gset
do $$ declare r jsonb; begin
  begin perform public.wiki_decide('e1000000-0000-0000-0000-000000000003', 'reject'); raise exception 'відхилено без причини';
  exception when sqlstate 'QH011' then null; end;
  r := public.wiki_decide('e1000000-0000-0000-0000-000000000003', 'accept');
  assert (select name = 'Пілот' and created_by = '00000000-0000-0000-0000-0000000000e1' from public.jobs where id = 'pilot'), 'нова робота не створилась';
  insert into public.wiki_bans (user_id, reason, by) values ('00000000-0000-0000-0000-0000000000e2', 'спам', auth.uid());
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false) \gset
do $$ begin
  assert (select reason from public.wiki_bans where user_id = auth.uid()) = 'спам', 'заблокований не бачить причину';
  begin insert into public.wiki_proposals (section, target_id, kind, data, source) values ('job', 'taxi', 'edit', '{"pay":"c"}', 'game');
    raise exception 'заблокований подав пропозицію';
  exception when sqlstate 'QH001' then null; end;
  begin insert into public.wiki_bans (user_id, reason) values ('00000000-0000-0000-0000-0000000000e1', 'помста');
    raise exception 'гравець заблокував іншого';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- прибрана сторінка не видна гостю, видна модератору ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \gset
insert into public.wiki_proposals (id, section, target_id, kind, source) values ('e1000000-0000-0000-0000-000000000005', 'job', 'pilot', 'hide', 'game');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', false) \gset
do $$ begin
  perform public.wiki_decide('e1000000-0000-0000-0000-000000000005', 'accept');
  assert (select hidden from public.jobs where id = 'pilot'), 'сторінку не прибрано';
end $$;
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.jobs where id = 'pilot') = 0, 'прибрана сторінка видна гостю';
  assert (select accepted_pages from public.wiki_contributors where id = '00000000-0000-0000-0000-0000000000e1') = 1, 'рейтинг не рахує нову сторінку';
  -- рейтинг показує нік у Q-Hub, а не ім'я Discord (0058)
  assert (select name from public.wiki_contributors where id = '00000000-0000-0000-0000-0000000000e1') = 'Gravets_Nick', 'у рейтингу ім''я Discord замість ніка';
  begin perform public.wiki_snapshot('job', 'pilot'); raise exception 'гість прочитав знімок прихованої сторінки';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', false) \gset
do $$ begin
  assert (select count(*) from public.jobs where id = 'pilot') = 1, 'модератор не бачить прибрану сторінку';
  perform public.wiki_unhide('job', 'pilot', 'повернули в гру');
  assert not (select hidden from public.jobs where id = 'pilot'), 'сторінку не повернуто';
end $$;
reset role;

-- ---------- мітки на мапі від гравців (0059, US5) ----------
insert into public.map_categories (id, name) values ('wiki-test-cat', 'Тест довідника') on conflict (id) do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \gset
insert into public.wiki_proposals (id, section, kind, data, source)
  values ('e1000000-0000-0000-0000-000000000006', 'map_point', 'new', '{"category_id":"wiki-test-cat","name":"Грибне місце","note":"біля озера","x":100,"y":200}', 'game');
do $$ begin
  begin insert into public.wiki_proposals (section, kind, data, source) values ('map_point', 'new', '{"category_id":"немає-такої","name":"X","x":1,"y":1}', 'game');
    raise exception 'мітку в неіснуючій категорії прийнято';
  exception when sqlstate 'QH003' then null; end;
  begin insert into public.wiki_proposals (section, kind, data, source) values ('map_point', 'new', '{"category_id":"wiki-test-cat","name":"X","x":99999,"y":1}', 'game');
    raise exception 'мітку поза мапою прийнято';
  exception when sqlstate 'QH003' then null; end;
  begin insert into public.wiki_proposals (section, kind, data, source) values ('map_point', 'new', '{"category_id":"wiki-test-cat","name":"X"}', 'game');
    raise exception 'мітку без точки прийнято';
  exception when sqlstate 'QH003' then null; end;
  begin insert into public.wiki_proposals (section, target_id, kind, data, source)
    select 'map_point', id::text, 'edit', '{"name":"Інше"}', 'game' from public.map_points limit 1;
    raise exception 'правку наявної мітки прийнято';
  exception when sqlstate 'QH003' then null; end;
  begin insert into public.map_points (category_id, name, x, y) values ('wiki-test-cat', 'Напряму', 1, 1); raise exception 'гравець поставив мітку напряму';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.map_points where name = 'Грибне місце') = 0, 'мітка з''явилась без рішення';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', false) \gset
do $$ declare r jsonb; begin
  r := public.wiki_decide('e1000000-0000-0000-0000-000000000006', 'accept');
  assert (select category_id = 'wiki-test-cat' and x = 100 and y = 200 and created_by = '00000000-0000-0000-0000-0000000000e1'
    from public.map_points where name = 'Грибне місце'), 'мітку не створено або автор не записався';
  assert (select count(*) from public.wiki_versions where section = 'map_point' and target_id = r ->> 'target_id') = 1, 'версії мітки немає';
end $$;
reset role;

-- ---------- «Актуально» і «Точка застаріла» (0060) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \gset
do $$ declare r jsonb; begin
  r := public.wiki_check('job', 'taxi');
  r := public.wiki_check('job', 'taxi');   -- повтор тим самим акаунтом нічого не додає
  assert (r ->> 'n')::int = 1, 'повторне «Актуально» додало голос';
  begin perform public.wiki_check('job', 'немає-такої'); raise exception 'підтверджено неіснуючу сторінку';
  exception when sqlstate 'QH014' then null; end;
  -- «Точка застаріла» без причини — ні
  begin insert into public.wiki_proposals (section, target_id, kind, source)
    select 'map_point', id::text, 'hide', 'game' from public.map_points where name = 'Грибне місце';
    raise exception 'точку застаріла без причини прийнято';
  exception when sqlstate 'QH003' then null; end;
end $$;
insert into public.wiki_proposals (id, section, target_id, kind, source, source_note)
  select 'e1000000-0000-0000-0000-000000000007', 'map_point', id::text, 'hide', 'game', 'гриби там більше не ростуть'
  from public.map_points where name = 'Грибне місце';
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false) \gset
do $$ declare r jsonb; begin
  r := public.wiki_check('job', 'taxi');
  assert (r ->> 'n')::int = 2, 'голос другого гравця не врахувався';
end $$;
reset role;

set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select n from public.wiki_check_counts where section = 'job' and target_id = 'taxi') = 2, 'гість не бачить лічильник «Актуально»';
  begin perform public.wiki_check('job', 'taxi'); raise exception 'гість підтвердив';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', false) \gset
do $$ declare pid text; begin
  perform public.wiki_decide('e1000000-0000-0000-0000-000000000007', 'accept');
  select id::text into pid from public.map_points where name = 'Грибне місце';
  assert (select hidden from public.map_points where id::text = pid), 'застарілу мітку не сховано';
  assert (select count(*) from public.wiki_versions where section = 'map_point' and target_id = pid) = 2, 'історія мітки: немає версії «прибрано»';
end $$;
reset role;

set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.map_points where name = 'Грибне місце') = 0, 'схована мітка видна гостю';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', false) \gset
do $$ declare pid text; begin
  select id::text into pid from public.map_points where name = 'Грибне місце';
  assert pid is not null, 'модератор не бачить сховану мітку';
  perform public.wiki_unhide('map_point', pid, 'гриби повернулись');
  assert not (select hidden from public.map_points where id::text = pid), 'мітку не повернуто';
end $$;
reset role;

-- ---------- admin напряму пише ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e5', false) \gset
do $$ begin
  update public.vehicles set price = 1500 where name = 'Wiki Test Car';
  assert (select price from public.vehicles where name = 'Wiki Test Car') = 1500, 'admin не змінив авто';
end $$;
reset role;

-- ---------- 0062: іконка роботи й видалення прибраної сторінки назавжди ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', false) \gset
do $$ begin
  begin perform public.wiki_purge_job('pilot'); raise exception 'модератор видалив сторінку назавжди';
  exception when sqlstate 'QH010' then null; end;
  update public.jobs set icon = 'https://x.supabase.co/a.webp' where id = 'pilot';
  assert (select icon from public.jobs where id = 'pilot') = '', 'модератор змінив іконку напряму';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e5', false) \gset
do $$ begin
  update public.jobs set icon = 'https://x.supabase.co/storage/v1/object/public/catalog/jobs/pilot.webp' where id = 'pilot';
  assert (select icon from public.jobs where id = 'pilot') like 'https://%', 'admin не змінив іконку';
  begin update public.jobs set icon = 'javascript:alert(1)' where id = 'pilot'; raise exception 'іконка не https пройшла';
  exception when check_violation then null; end;
  -- 0063: готова іконка мапи — шлях сайту
  update public.jobs set icon = '/icons/map/boat.svg' where id = 'pilot';
  assert (select icon from public.jobs where id = 'pilot') = '/icons/map/boat.svg', 'не взялась іконка з мапи';
  begin update public.jobs set icon = '/icons/../../etc"x.svg' where id = 'pilot'; raise exception 'кривий шлях іконки пройшов';
  exception when check_violation then null; end;
  begin perform public.wiki_purge_job('pilot'); raise exception 'видалено не прибрану сторінку';
  exception when sqlstate 'QH003' then null; end;
  update public.jobs set hidden = true where id = 'pilot';
  assert (select count(*) from public.wiki_versions where section = 'job' and target_id = 'pilot') > 0, 'у тестової роботи немає історії';
  perform public.wiki_purge_job('pilot');
  assert (select count(*) from public.jobs where id = 'pilot') = 0, 'роботу не видалено';
  assert (select count(*) from public.wiki_versions where section = 'job' and target_id = 'pilot') = 0, 'лишилась історія';
  assert (select count(*) from public.wiki_proposals where section = 'job' and (target_id = 'pilot' or data ->> 'id' = 'pilot')) = 0, 'лишились пропозиції';
  begin perform public.wiki_purge_job('pilot'); raise exception 'повторне видалення пройшло';
  exception when sqlstate 'QH014' then null; end;
end $$;
reset role;

select 'Довідник від гравців ok';
