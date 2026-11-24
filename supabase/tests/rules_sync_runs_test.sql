-- Журнал спроб оновлення правил (0081, specs/095): читає лише admin, ніхто з ролей не пише й не видаляє.
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000951', '{"full_name":"Sync Player"}'),
  ('00000000-0000-0000-0000-000000000952', '{"full_name":"Sync Admin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000952';
-- як функція (service-ключ, повз RLS)
insert into public.rules_sync_runs (via, by, ok, topics, items) values
  ('app', '00000000-0000-0000-0000-000000000952', true, 60, 3374),
  ('server', null, false, 60, 3374);

-- admin бачить усі спроби
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000952', false) \gset
do $$ begin
  assert (select count(*) from public.rules_sync_runs) >= 2, 'admin не бачить журналу спроб';
  assert (select via from public.rules_sync_runs where ok order by at desc limit 1) = 'app', 'остання вдала — не з програми';
  -- навіть admin не пише в журнал напряму: лише функція
  begin insert into public.rules_sync_runs (via, ok) values ('app', true); raise exception 'admin записав спробу напряму';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- гравець не бачить і не пише
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000951', false) \gset
do $$ begin
  assert (select count(*) from public.rules_sync_runs) = 0, 'гравець бачить журнал спроб';
  begin insert into public.rules_sync_runs (via, ok) values ('app', true); raise exception 'гравець записав спробу';
  exception when insufficient_privilege then null; end;
  delete from public.rules_sync_runs;
end $$;
reset role;
do $$ begin assert (select count(*) from public.rules_sync_runs) >= 2, 'гравець видалив спроби'; end $$;

-- анонім не бачить
set role anon;
do $$ begin assert (select count(*) from public.rules_sync_runs) = 0, 'анонім бачить журнал спроб'; end $$;
reset role;
