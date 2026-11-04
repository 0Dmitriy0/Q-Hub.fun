-- Підсумок грошей сеансу (0049, specs/044 FR-015, конституція II і V): свій сеанс бачить і змінює лише власник,
-- чужий — ні (і staff теж); обмеження відкидають неповні й неправдоподібні підсумки; money_rules читають усі, змінює admin.
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000044a1', '{"full_name":"MoneyOwner"}'),
  ('00000000-0000-0000-0000-0000000044a2', '{"full_name":"MoneyOther"}'),
  ('00000000-0000-0000-0000-0000000044a3', '{"full_name":"MoneyAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000044a3';
insert into public.characters (id, owner, name, static_id) values
  ('00000000-0000-0000-0000-0000000044c1', '00000000-0000-0000-0000-0000000044a1', 'Money_Owner', 440001),
  ('00000000-0000-0000-0000-0000000044c3', '00000000-0000-0000-0000-0000000044a3', 'Money_Admin', 440003);

-- власник: upsert за id, який генерує програма (як main.cjs) — один рядок; читає й оновлює свій підсумок
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000044a1', false) \gset
do $$ begin
  insert into public.game_sessions (id, character_id, external_id, started_at, ended_at)
    values ('00000000-0000-0000-0000-0000000044e1', '00000000-0000-0000-0000-0000000044c1', 'ext-1', '2026-11-03 18:00+00', '2026-11-03 18:02+00')
    on conflict (id) do update set ended_at = excluded.ended_at;
  insert into public.game_sessions (id, character_id, external_id, started_at, ended_at, money_from, money_to, money_start, money_end, money_gain)
    values ('00000000-0000-0000-0000-0000000044e1', '00000000-0000-0000-0000-0000000044c1', 'ext-1', '2026-11-03 18:00+00', '2026-11-03 19:00+00',
            '2026-11-03 18:01+00', '2026-11-03 18:59+00', 1000000, 1120000, 150000)
    on conflict (id) do update set ended_at = excluded.ended_at, money_from = excluded.money_from,
      money_to = excluded.money_to, money_start = excluded.money_start, money_end = excluded.money_end, money_gain = excluded.money_gain;
  assert (select count(*) from public.game_sessions where external_id = 'ext-1') = 1, 'повторний upsert дав дубль';
  assert (select money_gain = 150000 and money_end - money_start = 120000 and not money_flag
          from public.game_sessions where external_id = 'ext-1'), 'власник не бачить свого підсумку';
  update public.game_sessions set money_flag = true where external_id = 'ext-1';
  assert (select money_flag from public.game_sessions where external_id = 'ext-1'), 'власник не оновив свій сеанс';
  update public.game_sessions set money_flag = false where external_id = 'ext-1';

  -- обмеження: неповний підсумок, кінець раніше за початок, від'ємні суми
  begin
    insert into public.game_sessions (character_id, external_id, started_at, money_from) values ('00000000-0000-0000-0000-0000000044c1', 'bad-1', now(), now());
    raise exception 'неповний підсумок пройшов';
  exception when check_violation then null; end;
  begin
    insert into public.game_sessions (character_id, external_id, started_at, money_from, money_to, money_start, money_end, money_gain)
      values ('00000000-0000-0000-0000-0000000044c1', 'bad-2', now(), now(), now() - interval '1 minute', 0, 0, 0);
    raise exception 'кінець раніше за початок пройшов';
  exception when check_violation then null; end;
  begin
    insert into public.game_sessions (character_id, external_id, started_at, money_from, money_to, money_start, money_end, money_gain)
      values ('00000000-0000-0000-0000-0000000044c1', 'bad-3', now(), now(), now(), -1, 0, 0);
    raise exception 'від''ємний баланс пройшов';
  exception when check_violation then null; end;
  begin
    insert into public.game_sessions (character_id, external_id, started_at, money_from, money_to, money_start, money_end, money_gain)
      values ('00000000-0000-0000-0000-0000000044c1', 'bad-4', now(), now(), now(), 0, 0, -5);
    raise exception 'від''ємний «Заробив» пройшов';
  exception when check_violation then null; end;
end $$;
reset role;

-- інший гравець: не бачить, не змінює, не видаляє, не пише в чужого персонажа
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000044a2', false) \gset
do $$ begin
  assert (select count(*) from public.game_sessions where character_id = '00000000-0000-0000-0000-0000000044c1') = 0, 'інший гравець бачить чужі сеанси';
  update public.game_sessions set money_gain = 999999999 where character_id = '00000000-0000-0000-0000-0000000044c1';
  delete from public.game_sessions where character_id = '00000000-0000-0000-0000-0000000044c1';
  begin
    insert into public.game_sessions (character_id, external_id, started_at) values ('00000000-0000-0000-0000-0000000044c1', 'hack', now());
    raise exception 'інший гравець записав сеанс у чужого персонажа';
  exception when insufficient_privilege then null; end;
  -- upsert чужого id (програма з підробленим рядком) — не перезаписує чужий сеанс
  begin
    insert into public.game_sessions (id, character_id, started_at) values ('00000000-0000-0000-0000-0000000044e1', '00000000-0000-0000-0000-0000000044c1', now())
      on conflict (id) do update set money_gain = 0;
    raise exception 'інший гравець перезаписав чужий сеанс через upsert';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- адмін: чужих сеансів теж не бачить (особисті дані, принцип II)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000044a3', false) \gset
do $$ begin
  assert (select count(*) from public.game_sessions where character_id = '00000000-0000-0000-0000-0000000044c1') = 0, 'адмін бачить чужі сеанси';
  update public.game_sessions set money_gain = 0 where character_id = '00000000-0000-0000-0000-0000000044c1';
end $$;
reset role;

-- гість: нічого
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.game_sessions) = 0, 'гість бачить сеанси';
end $$;
reset role;

do $$ begin
  assert (select count(*) = 1 and bool_and(money_gain = 150000 and not money_flag) from public.game_sessions where external_id = 'ext-1'),
    'чужий гравець чи адмін змінили або видалили сеанс';
end $$;

-- money_rules: один рядок із типовими порогами; гість і гравець читають, але не змінюють
do $$ begin
  assert (select count(*) = 1 and bool_and(max_jump = 5000000 and min_minutes = 5) from public.money_rules), 'типові пороги не ті';
end $$;
set role anon;
do $$ begin
  assert (select max_jump from public.money_rules) = 5000000, 'гість не читає порогів';
  update public.money_rules set max_jump = 100000;
exception when insufficient_privilege then null;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000044a2', false) \gset
do $$ begin
  update public.money_rules set max_jump = 100000;
  begin insert into public.money_rules (id) values (false); raise exception 'другий рядок порогів пройшов';
  exception when check_violation or insufficient_privilege then null; end;
  delete from public.money_rules;
end $$;
reset role;
do $$ begin assert (select count(*) = 1 and bool_and(max_jump = 5000000) from public.money_rules), 'гравець змінив або видалив пороги'; end $$;

-- адмін: змінює в межах
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000044a3', false) \gset
do $$ begin
  update public.money_rules set max_jump = 3000000, min_minutes = 10;
  assert (select max_jump = 3000000 and min_minutes = 10 from public.money_rules), 'адмін не змінив пороги';
  begin update public.money_rules set min_minutes = 0; raise exception 'поріг 0 хв пройшов';
  exception when check_violation then null; end;
  update public.money_rules set max_jump = 5000000, min_minutes = 5;
end $$;
reset role;

-- повторний запуск міграції: нічого не дублює й не скидає
update public.money_rules set max_jump = 4000000;
\i supabase/migrations/0049_session_money.sql
do $$ begin
  assert (select count(*) = 1 and bool_and(max_jump = 4000000) from public.money_rules), 'повторний запуск 0049 дублює чи скидає пороги';
  assert (select count(*) from public.game_sessions where external_id = 'ext-1') = 1, 'повторний запуск 0049 зачепив сеанси';
end $$;
update public.money_rules set max_jump = 5000000;
\echo 'Підсумок грошей сеансу ok'
