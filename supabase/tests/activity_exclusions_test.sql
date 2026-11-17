-- Виключення з конкурсу активності (0076; specs/091 US3): внесок чи гравця на проміжок днів, обов'язкова причина,
-- скасування з історією; підрахунок змінюється одразу; внески гравця з причиною незарахування; лише admin.
-- Запуск: supabase/tests/run.sh (після activity_stats_test.sql — ті самі гравці й звіти)
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- ---------- не-admin ----------
set role authenticated;
do $$
declare who text;
begin
  foreach who in array array['a1', 'a5', 'a3'] loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091' || who, false);
    begin perform public.activity_exclude_event(1, 'спроба'); raise exception '% виключив внесок', who;
    exception when insufficient_privilege then null; end;
    begin perform public.activity_exclude_user('00000000-0000-0000-0000-0000000091a2', '2026-11-01', '2026-11-30', 'спроба');
      raise exception '% виключив гравця', who;
    exception when insufficient_privilege then null; end;
    begin perform public.activity_unexclude(1); raise exception '% скасував виключення', who;
    exception when insufficient_privilege then null; end;
    begin perform public.activity_user_events('00000000-0000-0000-0000-0000000091a1', '2026-11-01', '2026-11-30');
      raise exception '% бачить внески гравця', who;
    exception when insufficient_privilege then null; end;
    begin perform public.activity_exclusions_list('2026-11-01', '2026-11-30'); raise exception '% бачить виключення', who;
    exception when insufficient_privilege then null; end;
    assert (select count(*) from public.activity_exclusions) = 0, format('%s читає виключення', who);
  end loop;
end $$;

-- ---------- admin ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000091a4', false) \gset
do $$
declare base int; ev bigint; x1 bigint; x2 bigint; xu bigint;
  a constant uuid := '00000000-0000-0000-0000-0000000091a1';
  b constant uuid := '00000000-0000-0000-0000-0000000091a2';
begin
  select cnt into base from public.activity_top('2026-11-01', '2026-11-30', 100) where category = 'prices' and user_id = a;
  assert base = 3, format('початково ціни A: %s', base);

  -- внески A: другий звіт i1 за 5 листопада — понад ліміт; назва товару й скупника є
  assert (select count(*) from public.activity_user_events(a, '2026-11-05', '2026-11-05', 'prices') where reason = 'over_daily_limit') = 2,
    'понад ліміт за добу не позначено';
  assert (select bool_and(title like '% — %') from public.activity_user_events(a, '2026-11-01', '2026-11-30', 'prices')), 'немає опису внеску ціни';
  assert (select count(*) from public.activity_user_events(a, '2026-11-01', '2026-11-30', 'guides') where counted and title = 'Гайд для конкурсу') = 1,
    'гайд A без назви чи не зарахований';
  assert (select count(*) from public.activity_user_events(a, '2026-11-01', '2026-11-30', 'guides') where reason = 'rejected') = 1,
    'відхилений гайд без причини';

  -- виключити зарахований звіт за 1 листопада → −1 одразу; повтор — той самий id
  select event_id into ev from public.activity_user_events(a, '2026-11-01', '2026-11-01', 'prices') where counted;
  begin perform public.activity_exclude_event(ev, ''); raise exception 'порожню причину прийнято';
  exception when invalid_parameter_value then null; end;
  begin perform public.activity_exclude_event(ev, 'ab'); raise exception 'причину з 2 символів прийнято';
  exception when invalid_parameter_value then null; end;
  x1 := public.activity_exclude_event(ev, 'помилкова ціна');
  assert public.activity_exclude_event(ev, 'ще раз') = x1, 'повторне виключення дало другий запис';
  assert (select cnt from public.activity_top('2026-11-01', '2026-11-30', 100) where category = 'prices' and user_id = a) = base - 1, 'виключений внесок рахується';
  assert (select reason = 'excluded' and exclusion_reason = 'помилкова ціна' and excluded_by = 'Act_Admin'
          from public.activity_user_events(a, '2026-11-01', '2026-11-01', 'prices') where event_id = ev), 'виключення не видно в внесках';

  -- виключений перший звіт i1 за 5 листопада — зараховується наступний (ліміт рахує лише невиключені)
  select event_id into x2 from public.activity_user_events(a, '2026-11-05', '2026-11-05', 'prices') where counted and created_at = '2026-11-05 08:00+02';
  perform public.activity_exclude_event(x2, 'дубль скриншота');
  assert (select cnt from public.activity_top('2026-11-01', '2026-11-30', 100) where category = 'prices' and user_id = a) = base - 1,
    'після виключення першого звіту доби наступний не зарахувався';

  -- скасування → назад одразу; історія лишається
  perform public.activity_unexclude(x1);
  assert (select cnt from public.activity_top('2026-11-01', '2026-11-30', 100) where category = 'prices' and user_id = a) = base, 'скасування не повернуло внесок';
  begin perform public.activity_unexclude(x1); raise exception 'повторне скасування пройшло';
  exception when no_data_found then null; end;
  assert (select revoked_by_nick = 'Act_Admin' and revoked_at is not null from public.activity_exclusions_list('2026-11-01', '2026-11-30') where id = x1),
    'скасування не видно в історії';

  -- гравця B виключено на листопад → немає в топах листопада, жовтень не зачеплено
  begin perform public.activity_exclude_user(b, '2026-11-30', '2026-11-01', 'накрутка'); raise exception 'період навиворіт прийнято';
  exception when invalid_parameter_value then null; end;
  xu := public.activity_exclude_user(b, '2026-11-01', '2026-11-30', 'накрутка');
  assert not exists (select 1 from public.activity_top('2026-11-01', '2026-11-30', 100) where user_id = b), 'виключений гравець у топі';
  assert (select count(*) from public.activity_user_events(b, '2026-11-01', '2026-11-30', 'prices') where reason = 'player_excluded') = 2,
    'виключення гравця не видно в внесках';
  assert (select user_nick = 'Act_B' and reason = 'накрутка' from public.activity_exclusions_list('2026-11-01', '2026-11-30') where id = xu),
    'виключення гравця не в історії';
  perform public.activity_unexclude(xu);
  assert exists (select 1 from public.activity_top('2026-11-01', '2026-11-30', 100) where user_id = b), 'гравець не повернувся після скасування';
  perform public.activity_unexclude((select id from public.activity_exclusions where event_id = x2 and revoked_at is null));

  -- роль без участі видно в внесках
  assert (select bool_and(reason = 'role_excluded') from public.activity_user_events('00000000-0000-0000-0000-0000000091a3', '2026-11-01', '2026-11-30', 'prices')),
    'внески модератора без причини role_excluded';
end $$;
reset role;

do $$ begin
  begin insert into public.activity_exclusions (event_id, user_id, reason, created_by)
    values (1, '00000000-0000-0000-0000-0000000091a1', 'обидва', '00000000-0000-0000-0000-0000000091a4');
    raise exception 'виключення і внеску, і гравця прийнято';
  exception when check_violation then null; end;
end $$;
\echo 'Виключення ok: лише admin; причина 3–300; внесок і гравець на період, скасування з історією; ліміт цін рахує лише невиключені; причини незарахування видно'
