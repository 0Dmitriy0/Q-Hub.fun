-- Статистика активності (0075, 0079; specs/091): події з джерел (ціни, мітки, гайди), статуси модерації,
-- звірка таблиці подій з джерелами (activity_sync_all = 0), топ лише для admin, ліміт цін за київську добу,
-- нічия — хто раніше досяг, ролі без участі, налаштування. Запуск: supabase/tests/run.sh (після wiki- і map-тестів)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000091a1', '{"full_name":"ActPlayerA"}'),
  ('00000000-0000-0000-0000-0000000091a2', '{"full_name":"ActPlayerB"}'),
  ('00000000-0000-0000-0000-0000000091a3', '{"full_name":"ActMod"}'),
  ('00000000-0000-0000-0000-0000000091a4', '{"full_name":"ActAdmin"}'),
  ('00000000-0000-0000-0000-0000000091a5', '{"full_name":"ActEditor"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user', nick = 'Act_A' where id = '00000000-0000-0000-0000-0000000091a1';
update public.profiles set role = 'user', nick = 'Act_B' where id = '00000000-0000-0000-0000-0000000091a2';
update public.profiles set role = 'moderator', nick = 'Act_Mod' where id = '00000000-0000-0000-0000-0000000091a3';
update public.profiles set role = 'admin', nick = 'Act_Admin' where id = '00000000-0000-0000-0000-0000000091a4';
update public.profiles set role = 'editor', nick = 'Act_Ed' where id = '00000000-0000-0000-0000-0000000091a5';
insert into public.map_categories (id, name) values ('act-test', 'Тест активності') on conflict (id) do nothing;

-- звірка: таблиця подій точно відповідає джерелам
create function public.act_synced(msg text) returns void language plpgsql as $$
declare n int;
begin
  n := public.activity_sync_all();
  assert n = 0, format('%s: події розійшлися з джерелами (%s)', msg, n);
end $$;
create function public.act_status(p_source text, p_id text) returns text language sql as $$
  select status from public.activity_events where source = p_source and source_id = p_id $$;

-- ---------- ціни: сирі звіти без перевірок ціни (лише тригер подій лишається увімкненим) ----------
do $$ declare t record; begin
  for t in select tgname from pg_trigger where tgrelid = 'public.price_reports'::regclass and not tgisinternal and tgname <> 'activity_track' loop
    execute format('alter table public.price_reports disable trigger %I', t.tgname);
  end loop;
end $$;
select set_config('test.i1', (select item_id from public.buyer_items where buyer_id = 'hide' order by item_id limit 1)::text, false) as i1 \gset
select set_config('test.i2', (select item_id from public.buyer_items where buyer_id = 'hide' order by item_id offset 1 limit 1)::text, false) as i2 \gset

create function public.act_report(p_who text, p_item text, p_at timestamptz) returns bigint language sql as $$
  insert into public.price_reports (kind, buyer_id, item_id, price, reporter, source, created_at)
  values ('buyer', 'hide', current_setting(p_item)::bigint, 1000, ('00000000-0000-0000-0000-0000000091' || p_who)::uuid, 'player', p_at)
  returning id $$;

do $$
declare r1 bigint; r2 bigint; r3 bigint; r4 bigint; s bigint;
begin
  -- A: 3 звіти одного товару 5 листопада (Київ) → 1; інший товар → +1; звіт 23:59 31.10 за Києвом → жовтень
  r1 := public.act_report('a1', 'test.i1', '2026-11-05 08:00+02');
  r2 := public.act_report('a1', 'test.i1', '2026-11-05 11:00+02');
  r3 := public.act_report('a1', 'test.i1', '2026-11-05 23:30+02');
  r4 := public.act_report('a1', 'test.i2', '2026-11-05 12:00+02');
  perform public.act_report('a1', 'test.i1', '2026-10-31 23:59+02');
  perform public.act_report('a1', 'test.i1', '2026-11-01 00:00+02');
  assert public.act_status('price_reports', r1::text) = 'counted', 'звіт ціни не зарахований';
  assert (select group_key = 'hide|' || current_setting('test.i1') from public.activity_events where source = 'price_reports' and source_id = r1::text),
    'ключ групи ціни не той';
  -- виправлення звіту (update того ж рядка) — та сама подія
  update public.price_reports set price = 1100 where id = r1;
  assert (select count(*) from public.activity_events where source = 'price_reports' and source_id = r1::text) = 1, 'виправлення дало другу подію';
  -- видалення звіту → removed
  s := public.act_report('a1', 'test.i2', '2026-11-20 10:00+02');
  delete from public.price_reports where id = s;
  assert public.act_status('price_reports', s::text) = 'removed', 'видалений звіт рахується';
  -- звіти не про скупника подій не дають
  insert into public.price_reports (kind, item_id, price, reporter, source) values ('sell', current_setting('test.i1')::bigint, 5, '00000000-0000-0000-0000-0000000091a1', 'player')
    returning id into s;
  assert public.act_status('price_reports', s::text) is null, 'звіт sell став подією';
  -- B: 2 звіти різних товарів, пізніше за A; модератор, адмін і редактор — по одному
  perform public.act_report('a2', 'test.i1', '2026-11-06 10:00+02');
  perform public.act_report('a2', 'test.i2', '2026-11-06 11:00+02');
  perform public.act_report('a3', 'test.i1', '2026-11-07 10:00+02');
  perform public.act_report('a4', 'test.i1', '2026-11-07 10:00+02');
  perform public.act_report('a5', 'test.i1', '2026-11-07 10:00+02');
  perform public.act_synced('ціни');
end $$;

-- ---------- мітки: чернетка Alt+F9 ----------
do $$
declare p1 bigint; p2 bigint; b bigint;
begin
  insert into public.map_points (category_id, name, x, y) values ('act-test', 'Act point 1', 11, 11) returning id into p1;
  insert into public.map_drafts (id, author, taken_at, shot, created_at) values
    ('91000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000091a2', now(), 'x/1.jpg', '2026-11-08 10:00+02'),
    ('91000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000091a2', now(), 'x/2.jpg', '2026-11-08 11:00+02');
  assert public.act_status('map_drafts', '91000000-0000-0000-0000-000000000001') = 'pending', 'нова чернетка не pending';
  update public.map_drafts set status = 'published', reviewed_at = now(), point_id = p1 where id = '91000000-0000-0000-0000-000000000001';
  assert public.act_status('map_drafts', '91000000-0000-0000-0000-000000000001') = 'counted', 'опублікована чернетка не зарахована';
  update public.map_drafts set status = 'rejected', reviewed_at = now() where id = '91000000-0000-0000-0000-000000000002';
  assert public.act_status('map_drafts', '91000000-0000-0000-0000-000000000002') = 'rejected', 'відхилена чернетка не rejected';
  -- мітку сховали → removed; повернули → counted
  update public.map_points set hidden = true where id = p1;
  assert public.act_status('map_drafts', '91000000-0000-0000-0000-000000000001') = 'removed', 'схована мітка рахується';
  update public.map_points set hidden = false where id = p1;
  assert public.act_status('map_drafts', '91000000-0000-0000-0000-000000000001') = 'counted', 'повернута мітка не рахується';
  -- мітка в неопублікованій партії → removed; партію опубліковано → counted
  insert into public.map_batches (category_id, source) values ('act-test', 'game') returning id into b;
  update public.map_points set batch_id = b where id = p1;
  assert public.act_status('map_drafts', '91000000-0000-0000-0000-000000000001') = 'removed', 'мітка в неопублікованій партії рахується';
  update public.map_batches set published = true where id = b;
  assert public.act_status('map_drafts', '91000000-0000-0000-0000-000000000001') = 'counted', 'опублікована партія не рахується';
  perform set_config('test.p1', p1::text, false);
  perform public.act_synced('чернетки міток');
end $$;

-- ---------- мітки й гайди через довідник: гравець A пропонує, admin приймає ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091a1', false) \gset
insert into public.wiki_proposals (id, section, kind, data, source, created_at) values
  ('91000000-0000-0000-0000-0000000000a1', 'map_point', 'new', '{"category_id":"act-test","name":"Act wiki point","x":21,"y":21}', 'game', '2026-11-09 10:00+02'),
  ('91000000-0000-0000-0000-0000000000a2', 'guide', 'new',
   '{"id":"akt-gaid","name":"Гайд для конкурсу","summary":"Тест","blocks":[{"k":"p","text":"Текст гайду"}]}', 'own', '2026-11-09 11:00+02'),
  ('91000000-0000-0000-0000-0000000000a3', 'guide', 'new',
   '{"id":"akt-gaid-2","name":"Відхилений гайд","summary":"Тест","blocks":[{"k":"p","text":"Текст"}]}', 'own', '2026-11-09 12:00+02');
reset role;
do $$ begin
  assert public.act_status('wiki_proposals', '91000000-0000-0000-0000-0000000000a2') = 'pending', 'пропозиція гайду не pending';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091a4', false) \gset
do $$ begin
  perform public.wiki_decide('91000000-0000-0000-0000-0000000000a1', 'accept');
  perform public.wiki_decide('91000000-0000-0000-0000-0000000000a2', 'accept');
  perform public.wiki_decide('91000000-0000-0000-0000-0000000000a3', 'reject', null, 'не про гру');
end $$;
reset role;

-- правка прийнятого гайду подій не дає
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091a1', false) \gset
insert into public.wiki_proposals (id, section, target_id, kind, data, source) values
  ('91000000-0000-0000-0000-0000000000a4', 'guide', 'akt-gaid', 'edit', '{"summary":"Нове"}', 'own');
reset role;

do $$
declare wp bigint;
begin
  assert public.act_status('wiki_proposals', '91000000-0000-0000-0000-0000000000a1') = 'counted', 'прийнята мітка з довідника не зарахована';
  assert public.act_status('wiki_proposals', '91000000-0000-0000-0000-0000000000a2') = 'counted', 'прийнятий гайд не зарахований';
  assert (select entity_id from public.activity_events where source = 'wiki_proposals' and source_id = '91000000-0000-0000-0000-0000000000a2') = 'akt-gaid',
    'гайд без entity_id';
  assert public.act_status('wiki_proposals', '91000000-0000-0000-0000-0000000000a3') = 'rejected', 'відхилений гайд не rejected';
  assert public.act_status('wiki_proposals', '91000000-0000-0000-0000-0000000000a4') is null, 'правка гайду стала подією';
  -- гайд сховали → removed; повернули → counted
  update public.wiki_guides set hidden = true where id = 'akt-gaid';
  assert public.act_status('wiki_proposals', '91000000-0000-0000-0000-0000000000a2') = 'removed', 'схований гайд рахується';
  update public.wiki_guides set hidden = false where id = 'akt-gaid';
  assert public.act_status('wiki_proposals', '91000000-0000-0000-0000-0000000000a2') = 'counted', 'повернутий гайд не рахується';
  -- одна мітка — один автор: опублікована чернетка на мітку з довідника забирає зарахування в пропозиції
  select v.target_id::bigint into wp from public.wiki_proposals p join public.wiki_versions v on v.id = p.version_id
    where p.id = '91000000-0000-0000-0000-0000000000a1';
  insert into public.map_drafts (id, author, taken_at, shot, status, reviewed_at, point_id, created_at) values
    ('91000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000091a2', now(), 'x/3.jpg', 'published', now(), wp, '2026-11-09 13:00+02');
  assert public.act_status('wiki_proposals', '91000000-0000-0000-0000-0000000000a1') = 'removed', 'мітку зараховано двом авторам';
  assert public.act_status('map_drafts', '91000000-0000-0000-0000-000000000003') = 'counted', 'чернетка на мітку не зарахована';
  perform public.act_synced('довідник');
  -- чернетку прибрали — пропозиція знову рахується
  delete from public.map_drafts where id = '91000000-0000-0000-0000-000000000003';
  assert public.act_status('wiki_proposals', '91000000-0000-0000-0000-0000000000a1') = 'counted', 'пропозиція не повернула зарахування';
  -- мітку видалили → removed
  delete from public.map_points where id = current_setting('test.p1')::bigint;
  assert public.act_status('map_drafts', '91000000-0000-0000-0000-000000000001') = 'removed', 'видалена мітка рахується';
  perform public.act_synced('після видалення');
end $$;

-- ---------- доступ до топу ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  begin perform public.activity_top('2026-11-01', '2026-11-30'); raise exception 'гість бачить топ';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.activity_events) = 0, 'гість читає події';
end $$;
reset role;

set role authenticated;
do $$
declare who text;
begin
  foreach who in array array['a1', 'a5', 'a3'] loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091' || who, false);
    begin perform public.activity_top('2026-11-01', '2026-11-30'); raise exception '% бачить топ', who;
    exception when insufficient_privilege then null; end;
    assert (select count(*) from public.activity_events) = 0, format('%s читає події', who);
    assert (select count(*) from public.activity_settings) = 0, format('%s читає налаштування', who);
    begin perform public.activity_settings_set(2, '{}'); raise exception '% змінив налаштування', who;
    exception when insufficient_privilege then null; end;
    begin perform public.activity_resync(); raise exception '% запустив звірку', who;
    exception when insufficient_privilege then null; end;
  end loop;
end $$;

-- ---------- admin: топ за листопад ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091a4', false) \gset
do $$
declare a int; b int; pa int; pb int;
begin
  assert (select count(*) from public.activity_events) > 0, 'admin не читає події';
  begin perform public.activity_top('2026-11-30', '2026-11-01'); raise exception 'період навиворіт прийнято';
  exception when invalid_parameter_value then null; end;
  begin perform public.activity_top('2026-01-01', '2027-01-03'); raise exception 'період понад рік прийнято';
  exception when invalid_parameter_value then null; end;

  -- A: 5 листопада i1 ×3 → 1, i2 → 1, 1 листопада 00:00 → 1 = 3; 31.10 23:59 — жовтень
  select cnt, place into a, pa from public.activity_top('2026-11-01', '2026-11-30', 100) where category = 'prices' and user_id = '00000000-0000-0000-0000-0000000091a1';
  assert a = 3, format('ціни A за листопад: %s замість 3', a);
  select cnt into a from public.activity_top('2026-10-01', '2026-10-31', 100) where category = 'prices' and user_id = '00000000-0000-0000-0000-0000000091a1';
  assert a = 1, format('ціни A за жовтень: %s замість 1', a);
  -- ролі: модератор і адмін не беруть участі, редактор — бере
  assert not exists (select 1 from public.activity_top('2026-11-01', '2026-11-30', 100)
                     where user_id in ('00000000-0000-0000-0000-0000000091a3', '00000000-0000-0000-0000-0000000091a4')), 'модератор чи адмін у топі';
  assert exists (select 1 from public.activity_top('2026-11-01', '2026-11-30', 100) where user_id = '00000000-0000-0000-0000-0000000091a5'), 'редактора немає в топі';
  -- мітки: A — 1 (з довідника), B — 0 (перша мітка видалена, друга відхилена, третю прибрали); гайди: A — 1
  assert (select cnt from public.activity_top('2026-11-01', '2026-11-30', 100) where category = 'marks' and user_id = '00000000-0000-0000-0000-0000000091a1') = 1,
    'мітки A не 1';
  assert not exists (select 1 from public.activity_top('2026-11-01', '2026-11-30', 100) where category = 'marks' and user_id = '00000000-0000-0000-0000-0000000091a2'),
    'мітки B рахуються';
  assert (select cnt from public.activity_top('2026-11-01', '2026-11-30', 100) where category = 'guides' and user_id = '00000000-0000-0000-0000-0000000091a1') = 1,
    'гайди A не 1';
  -- нічия: 6 листопада B має 2 (як A за 5 листопада) — вище A, бо досяг раніше
  select cnt, place into a, pa from public.activity_top('2026-11-05', '2026-11-06', 100) where category = 'prices' and user_id = '00000000-0000-0000-0000-0000000091a1';
  select cnt, place into b, pb from public.activity_top('2026-11-05', '2026-11-06', 100) where category = 'prices' and user_id = '00000000-0000-0000-0000-0000000091a2';
  assert a = 2 and b = 2 and pa < pb, format('нічия: A %s/%s, B %s/%s', a, pa, b, pb);
  -- нік без Discord-імені
  assert (select nick from public.activity_top('2026-11-01', '2026-11-30', 100) where category = 'prices' and user_id = '00000000-0000-0000-0000-0000000091a1') = 'Act_A',
    'нік не той';

  -- налаштування: ліміт 2 → A за 5 листопада i1 рахується двічі
  assert (select price_daily_limit = 1 and excluded_roles = '{admin,moderator}' from public.activity_settings_get()), 'типові налаштування не ті';
  perform public.activity_settings_set(2, '{admin,moderator}');
  assert (select cnt from public.activity_top('2026-11-01', '2026-11-30', 100) where category = 'prices' and user_id = '00000000-0000-0000-0000-0000000091a1') = 4,
    'ліміт 2 не діє';
  begin perform public.activity_settings_set(0, '{}'); raise exception 'ліміт 0 прийнято';
  exception when invalid_parameter_value then null; end;
  begin perform public.activity_settings_set(51, '{}'); raise exception 'ліміт 51 прийнято';
  exception when invalid_parameter_value then null; end;
  begin perform public.activity_settings_set(1, '{boss}'); raise exception 'роль boss прийнято';
  exception when invalid_parameter_value then null; end;
  -- зняти moderator з ролей без участі → модератор у топі одразу
  perform public.activity_settings_set(1, '{admin}');
  assert exists (select 1 from public.activity_top('2026-11-01', '2026-11-30', 100) where user_id = '00000000-0000-0000-0000-0000000091a3'), 'модератора немає після зміни ролей';
  assert not exists (select 1 from public.activity_top('2026-11-01', '2026-11-30', 100) where user_id = '00000000-0000-0000-0000-0000000091a4'), 'адмін у топі';
  perform public.activity_settings_set(1, '{admin,moderator}');
  assert public.activity_resync() = 0, 'звірка адміна знайшла розбіжність';
end $$;
reset role;

-- ---------- прибрати за собою (виключення й сповіщення тестують далі на тих самих гравцях) ----------
do $$ declare t record; begin
  for t in select tgname from pg_trigger where tgrelid = 'public.price_reports'::regclass and not tgisinternal and tgname <> 'activity_track' loop
    execute format('alter table public.price_reports enable trigger %I', t.tgname);
  end loop;
end $$;
drop function public.act_report(text, text, timestamptz);
drop function public.act_synced(text);
drop function public.act_status(text, text);
\echo 'Статистика активності ok: події з цін, міток і гайдів за статусом модерації; звірка з джерелами 0; топ лише admin; ліміт цін за київську добу; нічия — хто раніше; ролі й налаштування'
