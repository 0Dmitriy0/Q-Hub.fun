-- Глосарій RP-термінів (0080; specs/093, конституція 1.4.0): читають усі; змінюють лише admin і moderator через RPC;
-- кожна дія — версія; відкат і повернення прибраного; назви унікальні (крім ТК з різними повними назвами).
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000093a1', '{"full_name":"GlosUser"}'),
  ('00000000-0000-0000-0000-0000000093a2', '{"full_name":"GlosEditor"}'),
  ('00000000-0000-0000-0000-0000000093a3', '{"full_name":"GlosMod"}'),
  ('00000000-0000-0000-0000-0000000093a4', '{"full_name":"GlosAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000093a1';
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-0000000093a2';
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-0000000093a3';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000093a4';

do $$ begin
  assert (select count(*) from public.glossary_terms) >= 20, 'початковий список не накотився';
  assert (select count(*) from public.glossary_terms where term = 'ТК') = 2, 'ТК має бути двома термінами';
  assert (select count(*) from public.glossary_versions where action = 'create') >= 20, 'немає версій початкового списку';
end $$;

-- ---------- гість ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select related_rules = '{ЗП 6.9}' from public.glossary_terms where term = 'ДМ'), 'гість не бачить ДМ';
  assert (select count(*) from public.glossary_versions) = 0, 'гість бачить версії';
  begin perform public.glossary_save(null, 'ТСТ', '{}', '', 'x', '{}'); raise exception 'гість додав термін';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- user і editor не змінюють ----------
set role authenticated;
do $$
declare who text; dm uuid := (select id from public.glossary_terms where term = 'ДМ');
begin
  foreach who in array array['a1', 'a2'] loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000093' || who, false);
    begin perform public.glossary_save(null, 'ТСТ', '{}', '', 'x', '{}'); raise exception '% додав термін', who;
    exception when insufficient_privilege then null; end;
    begin perform public.glossary_save(dm, 'ДМ', '{}', '', 'зламав', '{}'); raise exception '% змінив термін', who;
    exception when insufficient_privilege then null; end;
    begin perform public.glossary_hide(dm); raise exception '% прибрав термін', who;
    exception when insufficient_privilege then null; end;
    begin perform public.glossary_revert(dm, 1); raise exception '% відкотив термін', who;
    exception when insufficient_privilege then null; end;
    assert (select count(*) from public.glossary_versions) = 0, format('%s бачить версії', who);
    update public.glossary_terms set description = 'зламав' where id = dm;
    assert (select description <> 'зламав' from public.glossary_terms where id = dm), format('%s змінив напряму', who);
  end loop;
end $$;

-- ---------- moderator: створює, змінює, ховає, повертає, відкочує ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000093a3', false) \gset
do $$
declare id1 uuid;
begin
  id1 := public.glossary_save(null, ' ТСТ ', array['TST', 'tst', ' '], 'Тестовий термін', 'Перше пояснення.', array['ЗП 1.1']);
  assert (select term = 'ТСТ' and cardinality(aliases) = 2 from public.glossary_terms where id = id1), 'обрізання й порожні назви';
  perform public.glossary_save(id1, 'ТСТ', array['TST'], 'Тестовий термін', 'Друге пояснення.', '{}');
  assert (select version = 2 and description = 'Друге пояснення.' from public.glossary_terms where id = id1), 'правка не записалась';
  perform public.glossary_hide(id1);
  assert (select hidden from public.glossary_terms where id = id1), 'не прибрано';
  perform public.glossary_unhide(id1);
  perform public.glossary_revert(id1, 1);
  assert (select version = 5 and description = 'Перше пояснення.' and related_rules = '{ЗП 1.1}' and not hidden from public.glossary_terms where id = id1), 'відкат не повернув версію 1';
  assert (select string_agg(action, ',' order by version_no) from public.glossary_versions where term_id = id1) = 'create,edit,hide,unhide,revert', 'історія дій не та';
  assert (select author = '00000000-0000-0000-0000-0000000093a3' from public.glossary_versions where term_id = id1 and version_no = 2), 'автор версії не записався';
  -- унікальність назв
  begin perform public.glossary_save(null, 'ДМ2', array['dm'], '', 'x', '{}'); raise exception 'дубль назви DM прийнято';
  exception when unique_violation then null; end;
  begin perform public.glossary_save(null, 'ЗЗ', '{}', '', 'x', '{}'); raise exception 'дубль скорочення ЗЗ прийнято';
  exception when unique_violation then null; end;
  -- однакове скорочення з іншою повною назвою — можна (як ТК)
  perform public.glossary_save(null, 'ТК', '{}', 'Тестовий кодекс', 'Ще одне значення ТК.', '{}');
  -- межі полів
  begin perform public.glossary_save(null, 'ДОВГЕ', '{}', '', repeat('x', 301), '{}'); raise exception 'пояснення 301 прийнято';
  exception when invalid_parameter_value then null; end;
  begin perform public.glossary_save(null, repeat('Ж', 13), '{}', '', 'x', '{}'); raise exception 'скорочення 13 прийнято';
  exception when invalid_parameter_value then null; end;
  begin perform public.glossary_save(null, 'ЖЖ', '{}', '', 'x', array[repeat('x', 41)]); raise exception 'пункт 41 прийнято';
  exception when invalid_parameter_value then null; end;
  -- прибраний не заважає назві; повернення з конфліктом — відмова
  perform public.glossary_hide(id1);
  perform public.glossary_save(null, 'ТСЗ', array['TST'], '', 'Забрав назву TST.', '{}');
  begin perform public.glossary_unhide(id1); raise exception 'повернення з конфліктом назви пройшло';
  exception when unique_violation then null; end;
  assert (select count(*) from public.glossary_versions where term_id = id1) = 6, 'модератор не бачить версій';
end $$;

-- ---------- admin ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000093a4', false) \gset
do $$ begin
  perform public.glossary_save(null, 'ААА', '{}', '', 'Адмін теж може.', '{}');
  assert exists (select 1 from public.glossary_terms where term = 'ААА'), 'адмін не додав';
end $$;
reset role;

delete from public.glossary_terms where term in ('ТСТ', 'ТСЗ', 'ААА') or full_name = 'Тестовий кодекс';
\echo 'Глосарій ok: читають усі; змінюють лише moderator і admin з версіями; відкат і повернення; назви унікальні, ТК — двома значеннями'
