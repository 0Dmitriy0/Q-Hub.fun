-- Сповіщення гравцям (0077, 0078; specs/091 US4–US5): надсилає лише admin, повтор id без дубля; гравець бачить і позначає
-- лише свої; Discord-ідентифікатор і черга DM — лише для бота (service_role); повтори → failed після 5-ї спроби.
-- Запуск: supabase/tests/run.sh (після activity_stats_test.sql — ті самі гравці)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.identities (user_id, provider, provider_id) values
  ('00000000-0000-0000-0000-0000000091a1', 'discord', '123456789012345678');

-- ---------- гість ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  begin perform public.notification_send(gen_random_uuid(), '00000000-0000-0000-0000-0000000091a1', 'x', 'x', 'other');
    raise exception 'гість надіслав сповіщення';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- гравець і модератор не надсилають ----------
set role authenticated;
do $$
declare who text;
begin
  foreach who in array array['a2', 'a3'] loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091' || who, false);
    begin perform public.notification_send(gen_random_uuid(), '00000000-0000-0000-0000-0000000091a1', 'x', 'x', 'other');
      raise exception '% надіслав сповіщення', who;
    exception when insufficient_privilege then null; end;
    begin perform public.notifications_admin_list(); raise exception '% бачить історію', who;
    exception when insufficient_privilege then null; end;
    begin perform public.profiles_search_nick('Act'); raise exception '% шукає гравців', who;
    exception when insufficient_privilege then null; end;
    begin perform public.notification_dm_batch(); raise exception '% бере чергу DM', who;
    exception when insufficient_privilege then null; end;
    begin perform public.notification_dm_result(gen_random_uuid(), 'sent'); raise exception '% пише статус DM', who;
    exception when insufficient_privilege then null; end;
  end loop;
end $$;

-- ---------- admin надсилає A ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091a4', false) \gset
do $$ begin
  perform public.notification_send('91000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000091a1',
    '🏆 1 місце: Гайди — листопад 2026', 'Вітаємо, Act_A!', 'guides', 'Набір від адміністрації', 1, '2026-11-01', '2026-11-30');
  -- повтор того самого id — без дубля
  perform public.notification_send('91000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000091a1', 'інше', 'інше', 'other');
  perform public.notification_send('91000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000091a2', 'Привіт', 'Текст', 'other');
  assert (select count(*) from public.notifications where id = '91000000-0000-0000-0000-0000000000f1') = 1, 'повтор дав дубль';
  assert (select title from public.notifications where id = '91000000-0000-0000-0000-0000000000f1') = '🏆 1 місце: Гайди — листопад 2026', 'повтор переписав сповіщення';
  assert (select sender = '00000000-0000-0000-0000-0000000091a4' and discord_status = 'queued' from public.notifications where id = '91000000-0000-0000-0000-0000000000f1'),
    'відправник чи статус Discord не ті';
  begin perform public.notification_send(gen_random_uuid(), '00000000-0000-0000-0000-0000000091a1', '', 'x', 'other'); raise exception 'порожній заголовок прийнято';
  exception when check_violation then null; end;
  begin perform public.notification_send(gen_random_uuid(), '00000000-0000-0000-0000-0000000091a1', repeat('x', 121), 'x', 'other'); raise exception 'заголовок 121 прийнято';
  exception when check_violation then null; end;
  begin perform public.notification_send(gen_random_uuid(), '00000000-0000-0000-0000-0000000091a1', 'x', repeat('x', 1501), 'other'); raise exception 'текст 1501 прийнято';
  exception when check_violation then null; end;
  begin perform public.notification_send(gen_random_uuid(), '00000000-0000-0000-0000-0000000091a1', 'x', 'x', 'drift'); raise exception 'невідома категорія прийнята';
  exception when check_violation then null; end;
  assert (select count(*) from public.profiles_search_nick('act_')) >= 2, 'пошук за ніком не знайшов';
  assert (select count(*) from public.profiles_search_nick('a')) = 0, 'пошук з 1 символу щось повернув';
  assert (select recipient_nick = 'Act_A' and sender_nick = 'Act_Admin' and read_at is null
          from public.notifications_admin_list() where id = '91000000-0000-0000-0000-0000000000f1'), 'історія без ніків чи вже прочитано';
end $$;

-- ---------- гравець A бачить лише своє й позначає прочитаним ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091a1', false) \gset
do $$
declare n int;
begin
  assert (select count(*) from public.notifications) = 1, 'A бачить не лише своє';
  assert (select count(*) from public.notifications where read_at is null) = 1, 'лічильник непрочитаних A не 1';
  -- пряма зміна заборонена
  update public.notifications set read_at = now(), title = 'зламав' where id = '91000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  assert n = 0, 'A змінив сповіщення напряму';
  -- чуже прочитання нічого не змінює
  perform public.notification_read('91000000-0000-0000-0000-0000000000f2');
  perform public.notification_read('91000000-0000-0000-0000-0000000000f1');
  assert (select read_at is not null from public.notifications where id = '91000000-0000-0000-0000-0000000000f1'), 'прочитання не записалось';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091a2', false) \gset
do $$ begin
  assert (select count(*) from public.notifications) = 1, 'B бачить не лише своє';
  assert (select read_at is null from public.notifications where id = '91000000-0000-0000-0000-0000000000f2'), 'A позначив сповіщення B';
  assert public.notifications_read_all() = 1, 'позначити все — не 1';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091a4', false) \gset
do $$ begin
  assert (select read_at is not null from public.notifications_admin_list() where id = '91000000-0000-0000-0000-0000000000f1'), 'адмін не бачить прочитання';
end $$;
reset role;

-- ---------- бот (service_role): черга з Discord-ідентифікатором, повтори → failed ----------
set role service_role;
do $$
declare r record; i int;
begin
  select * into r from public.notification_dm_batch(20) where id = '91000000-0000-0000-0000-0000000000f1';
  assert r.discord_user_id = '123456789012345678', 'немає Discord-ідентифікатора';
  assert (select discord_user_id is null from public.notification_dm_batch(20) where id = '91000000-0000-0000-0000-0000000000f2'), 'чужий ідентифікатор у B';
  perform public.notification_dm_result('91000000-0000-0000-0000-0000000000f2', 'failed', 'Акаунт Discord не знайдено');
  for i in 1..4 loop
    perform public.notification_dm_result('91000000-0000-0000-0000-0000000000f1', 'retry', 'Discord тимчасово недоступний');
  end loop;
end $$;
reset role;
do $$ begin
  assert (select discord_status = 'queued' and discord_attempts = 4 and discord_next_at > now() + interval '5 minutes'
          from public.notifications where id = '91000000-0000-0000-0000-0000000000f1'), '4 повтори: не в черзі або не та пауза';
  assert (select discord_status = 'failed' and discord_error = 'Акаунт Discord не знайдено'
          from public.notifications where id = '91000000-0000-0000-0000-0000000000f2'), 'failed не записався';
end $$;
set role service_role;
do $$ begin
  -- запис у майбутньому не береться в пакет
  assert not exists (select 1 from public.notification_dm_batch(20) where id = '91000000-0000-0000-0000-0000000000f1'), 'повтор узято раніше часу';
  perform public.notification_dm_result('91000000-0000-0000-0000-0000000000f1', 'retry', 'Discord тимчасово недоступний');
end $$;
reset role;
do $$ begin
  assert (select discord_status = 'failed' and discord_attempts = 5 and discord_error like '%(спроби вичерпано)'
          from public.notifications where id = '91000000-0000-0000-0000-0000000000f1'), 'п''ята спроба не failed';
end $$;

delete from public.notifications where id in ('91000000-0000-0000-0000-0000000000f1', '91000000-0000-0000-0000-0000000000f2');
\echo 'Сповіщення ok: надсилає лише admin, без дублів; гравець бачить і позначає лише свої; черга DM і Discord-ідентифікатор — лише боту; 5 спроб → failed'
