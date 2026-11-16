-- Звірі на полях полювання (0069, specs/088): бачать усі, змінює лише адмін; лише 8 відомих видів без повторів.
-- Запуск: supabase/tests/run.sh (після сіду полів полювання)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a3', '{"full_name":"AnimalAdmin"}'),
  ('00000000-0000-0000-0000-0000000000b3', '{"full_name":"AnimalUser"}')
  on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000000b3';

do $$ begin
  assert (select bool_and(animals = '{}') from public.map_areas where category_id = 'hunting-fields'), 'нові поля мають бути без звірів';
end $$;

-- адмін задає звірів поля
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', false) \gset
update public.map_areas set animals = '{deer,boar}' where name = 'Поле полювання 1';
do $$ begin
  assert (select animals from public.map_areas where name = 'Поле полювання 1') = '{deer,boar}', 'адмін не змінив звірів';
  begin update public.map_areas set animals = '{wolf}' where name = 'Поле полювання 2'; raise exception 'невідомого звіра прийнято';
  exception when check_violation then null; end;
  begin update public.map_areas set animals = '{deer,deer}' where name = 'Поле полювання 2'; raise exception 'повтор прийнято';
  exception when check_violation then null; end;
  begin update public.map_areas set animals = null where name = 'Поле полювання 2'; raise exception 'null прийнято';
  exception when not_null_violation or check_violation then null; end;
end $$;
-- місце звірів (0074): пара чисел або null
update public.map_areas set animals_at = '[120.5, -340]' where name = 'Поле полювання 1';
do $$ begin
  assert (select animals_at from public.map_areas where name = 'Поле полювання 1') = '[120.5, -340]'::jsonb, 'адмін не поставив місце звірів';
  assert (select animals_at from public.map_areas where name = 'Поле полювання 2') is null, 'місце звірів за замовчуванням має бути порожнім';
  begin update public.map_areas set animals_at = '[1]' where name = 'Поле полювання 2'; raise exception 'одне число прийнято';
  exception when check_violation then null; end;
  begin update public.map_areas set animals_at = '["a", 2]' where name = 'Поле полювання 2'; raise exception 'текст прийнято';
  exception when check_violation then null; end;
  update public.map_areas set animals_at = null where name = 'Поле полювання 1';
end $$;
reset role;

-- гість бачить, не змінює
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select animals from public.map_areas where name = 'Поле полювання 1') = '{deer,boar}', 'гість не бачить звірів';
  update public.map_areas set animals = '{rabbit}';
exception when insufficient_privilege then null;
end $$;
reset role;

-- гравець бачить, не змінює
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', false) \gset
do $$ begin
  update public.map_areas set animals = '{rabbit}';
exception when insufficient_privilege then null;
end $$;
reset role;

do $$ begin
  assert (select animals from public.map_areas where name = 'Поле полювання 1') = '{deer,boar}', 'не-адмін змінив звірів';
  assert (select count(*) from public.map_areas where animals = '{rabbit}') = 0, 'не-адмін змінив звірів';
end $$;
update public.map_areas set animals = '{}' where name = 'Поле полювання 1';
\echo 'Звірі на полях ok: бачать усі; гість і гравець не змінюють; лише 8 видів без повторів'
