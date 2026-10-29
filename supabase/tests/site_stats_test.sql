-- Плитки головної (0032, specs/011): гість бачить лише загальні числа, службові акаунти не рахуються,
-- завантаження лише +1 через count_download(). Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f7', '{"full_name":"StatsUser"}'),
  ('00000000-0000-0000-0000-0000000000f8', '{"full_name":"StatsEditor"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000000f7';
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-0000000000f8';

select set_config('test.p0', public.site_stats() ->> 'players', false) as p0, set_config('test.d0', public.site_stats() ->> 'downloads', false) as d0 \gset

-- гість: числа є, таблиць не видно, лічильник лише +1
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ declare s json := public.site_stats(); begin
  assert (s ->> 'players') is not null and (s ->> 'pins') is not null and (s ->> 'downloads') is not null, 'гість не бачить показників';
  perform public.count_download();
  perform public.count_download();
  assert (select count(*) from public.site_counters) = 0, 'гість читає лічильники напряму';
  update public.site_counters set n = 1000000;
  begin insert into public.site_counters (key, n) values ('fake', 5); raise exception 'гість вставив лічильник';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin
  assert (public.site_stats() ->> 'downloads')::int = current_setting('test.d0')::int + 2, 'завантаження не +2 або гість переписав лічильник';
  assert (public.site_stats() ->> 'players')::int = current_setting('test.p0')::int, 'лічильник гравців змінився без нових гравців';
  update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000000f8';
  assert (public.site_stats() ->> 'players')::int = current_setting('test.p0')::int + 1, 'гравця не пораховано';
  update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-0000000000f8';
  assert (public.site_stats() ->> 'players')::int = current_setting('test.p0')::int, 'службовий акаунт пораховано як гравця';
  assert (public.site_stats() ->> 'pins')::int = (select count(*) from public.map_points), 'мітки пораховано не всі';
end $$;

\i supabase/migrations/0032_site_stats.sql
do $$ begin assert (public.site_stats() ->> 'downloads')::int = current_setting('test.d0')::int + 2, 'повторний запуск міграції обнулив завантаження'; end $$;
\echo 'Плитки головної ok'
