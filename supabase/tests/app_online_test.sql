-- Онлайн програми (0023): ping лише з входом і лише свій рядок, лічильник бачать усі, таблиця закрита. Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', '{"full_name":"AppUser1"}'),
  ('00000000-0000-0000-0000-0000000000e2', '{"full_name":"AppUser2"}')
  on conflict (id) do nothing;
-- давній запис: не рахується онлайн
insert into public.app_presence (user_id, seen_at) values ('00000000-0000-0000-0000-0000000000e2', now() - interval '10 minutes');

-- гість: ping заборонено, лічильник можна, таблицю не видно
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  begin perform public.app_ping(); raise exception 'гість відмітився онлайн';
  exception when insufficient_privilege then null; end;
  assert public.app_online() = 0, 'давній запис рахується онлайн';
  assert (select count(*) from public.app_presence) = 0, 'гість бачить таблицю присутності';
end $$;
reset role;

-- гравець з програмою: ping двічі — один рядок, лічильник 1; чужий рядок не чіпає
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \gset
do $$ begin
  perform public.app_ping(); perform public.app_ping();
  assert public.app_online() = 1, 'лічильник не 1 після ping';
  assert (select count(*) from public.app_presence) = 0, 'гравець читає таблицю напряму';
  begin update public.app_presence set seen_at = now(); exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.app_presence where user_id = '00000000-0000-0000-0000-0000000000e1') = 1, 'ping дублює рядок';
  assert (select seen_at < now() - interval '5 minutes' from public.app_presence where user_id = '00000000-0000-0000-0000-0000000000e2'), 'гравець змінив чужий рядок';
end $$;

\echo 'Онлайн програми ok'
