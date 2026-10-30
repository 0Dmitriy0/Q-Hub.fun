-- Джерела правил (0039, specs/010 US3): бачить і змінює лише admin; адреса — лише форум сервера; тип — rules/law/order;
-- два джерела за замовчуванням; знімок у бакеті rules гравець не запише. Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000008a', '{"full_name":"RulesUser"}'),
  ('00000000-0000-0000-0000-00000000008b', '{"full_name":"RulesAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000008b';

create function public.test_rules_err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
grant execute on function public.test_rules_err(text) to anon, authenticated;   -- лише на час тесту, наприкінці видаляється

-- два джерела за замовчуванням
do $$ begin
  assert (select count(*) from public.rule_sources where kind = 'rules' and url like '%/forum/10-%') = 1, 'немає «Правил серверу» за замовчуванням';
  assert (select count(*) from public.rule_sources where kind = 'law' and url like '%/forum/36-%') = 1, 'немає «Законодавчої бази» за замовчуванням';
end $$;

-- гість і гравець: не бачать, не додають, не змінюють, не видаляють; знімок не запишуть
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.rule_sources) = 0, 'гість бачить джерела';
  assert public.test_rules_err($q$insert into public.rule_sources (url, kind) values ('https://forum.quant5.com.ua/index.php?/topic/1-x/', 'rules')$q$) is not null, 'гість додав джерело';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000008a', false) \gset
do $$ begin
  assert (select count(*) from public.rule_sources) = 0, 'гравець бачить джерела';
  assert public.test_rules_err($q$insert into public.rule_sources (url, kind) values ('https://forum.quant5.com.ua/index.php?/topic/1-x/', 'rules')$q$) like '42501%', 'гравець додав джерело';
  update public.rule_sources set enabled = false;
  delete from public.rule_sources;
  assert public.test_rules_err($q$insert into storage.objects (bucket_id, name) values ('rules', 'rules.json')$q$) like '42501%', 'гравець записав знімок правил';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.rule_sources where enabled) = 2, 'гравець вимкнув чи видалив джерело';
end $$;

-- admin: додає, вимикає, видаляє; лише форум сервера й лише відомий тип
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000008b', false) \gset
do $$ begin
  assert (select count(*) from public.rule_sources) = 2, 'адмін не бачить джерел';
  insert into public.rule_sources (url, kind) values ('https://forum.quant5.com.ua/index.php?/forum/57-lspd/', 'order');
  assert (select created_by from public.rule_sources where url like '%/forum/57-%') = auth.uid(), 'не записано, хто додав';
  update public.rule_sources set enabled = false where url like '%/forum/57-%';
  assert not (select enabled from public.rule_sources where url like '%/forum/57-%'), 'адмін не вимкнув джерело';
  delete from public.rule_sources where url like '%/forum/57-%';
  assert not exists (select 1 from public.rule_sources where url like '%/forum/57-%'), 'адмін не видалив джерело';
  -- «Довідка» (0041): F.A.Q. з «Новин та інформації»
  insert into public.rule_sources (url, kind) values ('https://forum.quant5.com.ua/index.php?/forum/3-новини-та-інформація/', 'info');
  delete from public.rule_sources where kind = 'info';
  -- інший сайт, http, розділ без «/forum/» чи «/topic/», лапки — відмова
  assert public.test_rules_err($q$insert into public.rule_sources (url, kind) values ('https://quantfun.com.ua/index.php?/forum/1-x/', 'rules')$q$) like '23514%', 'прийнято чужий сайт';
  assert public.test_rules_err($q$insert into public.rule_sources (url, kind) values ('http://forum.quant5.com.ua/index.php?/forum/1-x/', 'rules')$q$) like '23514%', 'прийнято http';
  assert public.test_rules_err($q$insert into public.rule_sources (url, kind) values ('https://forum.quant5.com.ua/index.php?/profile/1-x/', 'rules')$q$) like '23514%', 'прийнято профіль замість розділу';
  assert public.test_rules_err($q$insert into public.rule_sources (url, kind) values ('https://forum.quant5.com.ua/index.php?/topic/1-x"onerror/', 'rules')$q$) like '23514%', 'прийнято адресу з лапками';
  assert public.test_rules_err($q$insert into public.rule_sources (url, kind) values ('https://forumXquant5.com.ua/index.php?/topic/1-x/', 'rules')$q$) like '23514%', 'крапка в адресі — будь-який символ';
  assert public.test_rules_err($q$insert into public.rule_sources (url, kind) values ('https://forum.quant5.com.ua/index.php?/topic/1-x/', 'news')$q$) like '23514%', 'прийнято невідомий тип';
  -- той самий розділ двічі — відмова
  assert public.test_rules_err($q$insert into public.rule_sources (url, kind) values ('https://forum.quant5.com.ua/index.php?/forum/10-правила-серверу/', 'rules')$q$) like '23505%', 'прийнято дубль джерела';
end $$;
reset role;

drop function public.test_rules_err(text);
\echo 'Джерела правил ok: лише admin бачить і змінює; лише форум сервера (розділ чи тема), тип rules/law/order, без дублів; два джерела за замовчуванням; знімок гравець не запише'
