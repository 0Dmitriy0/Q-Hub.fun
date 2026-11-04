-- Івенти у WIKI (0051, specs/055): читають усі; пишуть season_events, season_event_maps, season_event_levels лише staff
-- (editor, moderator, admin); перевірки полів; каскади; адреса без slug; фото — лише staff і лише в catalog/events/.
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000005501', '{"full_name":"EvUser"}'),
  ('00000000-0000-0000-0000-000000005502', '{"full_name":"EvEditor"}'),
  ('00000000-0000-0000-0000-000000005503', '{"full_name":"EvModerator"}'),
  ('00000000-0000-0000-0000-000000005504', '{"full_name":"EvAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-000000005502';
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-000000005503';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000005504';

-- івент без slug (як зі старої форми) отримує адресу event-<id>
insert into public.season_events (title, starts_on, ends_on) values ('Тест Хелловін', '2026-10-23', '2026-11-09');
do $$ begin
  assert (select slug = 'event-' || id from public.season_events where title = 'Тест Хелловін'), 'без slug не стало event-<id>';
end $$;
select id as ev from public.season_events where title = 'Тест Хелловін' \gset
insert into public.map_categories (id, name, grp) values ('ev-test-cat', 'Тест', 'Івенти') on conflict (id) do nothing;

-- гість: читає все, не пише
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.season_events where title = 'Тест Хелловін') = 1, 'гість не бачить івент';
  perform 1 from public.season_event_maps; perform 1 from public.season_event_levels;
  begin insert into public.season_events (title, slug, starts_on) values ('Гість', 'gist', '2026-11-01'); raise exception 'гість додав івент';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- user: читає, не пише жодну з трьох таблиць і не вантажить фото
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005501', false) \gset
select set_config('test.ev', :'ev', false) \gset
do $$ declare e bigint := current_setting('test.ev')::bigint; begin
  begin insert into public.season_events (title, slug, starts_on) values ('Юзер', 'yuzer', '2026-11-01'); raise exception 'user додав івент';
  exception when insufficient_privilege then null; end;
  begin insert into public.season_event_maps values (e, 'ev-test-cat'); raise exception 'user прив''язав мапу';
  exception when insufficient_privilege then null; end;
  begin insert into public.season_event_levels (event_id, level, reward) values (e, 1, 'x'); raise exception 'user додав рівень';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name) values ('catalog', 'events/1.webp'); raise exception 'user завантажив фото';
  exception when insufficient_privilege then null; end;
end $$;
update public.season_events set title = 'зламано' where id = :ev;
reset role;
do $$ begin assert (select title = 'Тест Хелловін' from public.season_events where id = current_setting('test.ev')::bigint), 'user змінив івент'; end $$;

-- editor: пише всі три таблиці; фото — лише в events/
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005502', false) \gset
update public.season_events set slug = 'test-haloviin', kind = 'event', body = 'Опис', image_url = 'https://x.test/a.webp' where id = :ev;
insert into public.season_event_maps values (:ev, 'ev-test-cat');
insert into public.season_event_levels (event_id, level, line, reward) values (:ev, 1, 'free', '500 $'), (:ev, 1, 'paid', 'Кейс');
insert into storage.objects (bucket_id, name) values ('catalog', 'events/1.webp');
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('catalog', 'items/1.webp'); raise exception 'editor завантажив поза events/';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select slug = 'test-haloviin' and body = 'Опис' from public.season_events where id = current_setting('test.ev')::bigint), 'editor не змінив івент';
  assert (select count(*) from public.season_event_levels where event_id = current_setting('test.ev')::bigint) = 2, 'editor не додав рівні';
end $$;

-- moderator: теж staff
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000005503', false) \gset
insert into public.season_events (title, slug, kind, starts_on, ends_on) values ('Тест батл пас', 'test-bp', 'battlepass', '2026-10-23', '2026-11-30');
update public.season_event_levels set reward = '600 $' where event_id = :ev and level = 1 and line = 'free';
reset role;
do $$ begin
  assert (select count(*) from public.season_events where slug = 'test-bp') = 1, 'moderator не додав івент';
  assert (select reward = '600 $' from public.season_event_levels where event_id = current_setting('test.ev')::bigint and line = 'free'), 'moderator не змінив рівень';
end $$;

-- перевірки полів (від імені власника бази — RLS не заважає, лише check)
do $$ declare e bigint := current_setting('test.ev')::bigint; begin
  begin update public.season_events set slug = 'Погано!' where id = e; raise exception 'slug не за форматом пройшов';
  exception when check_violation then null; end;
  begin update public.season_events set slug = 'test-bp' where id = e; raise exception 'дубль slug пройшов';
  exception when unique_violation then null; end;
  begin update public.season_events set kind = 'daily' where id = e; raise exception 'kind поза переліком пройшов';
  exception when check_violation then null; end;
  begin update public.season_events set image_url = 'http://x.test/a.webp' where id = e; raise exception 'фото не https пройшло';
  exception when check_violation then null; end;
  begin update public.season_events set body = repeat('а', 20001) where id = e; raise exception 'body > 20000 пройшов';
  exception when check_violation then null; end;
  begin update public.season_events set prev_id = e where id = e; raise exception 'prev_id = id пройшов';
  exception when check_violation then null; end;
  begin insert into public.season_event_levels (event_id, level, reward) values (e, 501, 'x'); raise exception 'рівень 501 пройшов';
  exception when check_violation then null; end;
  begin insert into public.season_event_levels (event_id, level, line, reward) values (e, 2, 'vip', 'x'); raise exception 'line vip пройшла';
  exception when check_violation then null; end;
  begin insert into public.season_event_levels (event_id, level, reward) values (e, 3, ''); raise exception 'порожня нагорода пройшла';
  exception when check_violation then null; end;
  begin insert into public.season_event_levels (event_id, level, reward) values (e, 4, repeat('а', 201)); raise exception 'нагорода > 200 пройшла';
  exception when check_violation then null; end;
end $$;

-- prev_id: видалення попереднього обнуляє посилання
update public.season_events set prev_id = :ev where slug = 'test-bp';
-- видалення категорії мапи прибирає прив'язку; видалення івенту — його прив'язки й рівні
delete from public.map_categories where id = 'ev-test-cat';
do $$ begin assert (select count(*) from public.season_event_maps where event_id = current_setting('test.ev')::bigint) = 0, 'прив''язка до видаленої категорії лишилась'; end $$;
delete from public.season_events where id = :ev;
do $$ begin
  assert (select count(*) from public.season_event_levels where event_id = current_setting('test.ev')::bigint) = 0, 'рівні видаленого івенту лишились';
  assert (select prev_id is null from public.season_events where slug = 'test-bp'), 'prev_id не обнулився';
end $$;

delete from public.season_events where slug = 'test-bp';
delete from storage.objects where bucket_id = 'catalog' and name = 'events/1.webp';
select 'season_events_wiki ok';
