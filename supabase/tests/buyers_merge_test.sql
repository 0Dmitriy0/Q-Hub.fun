-- Злиття скупників (0040, specs/003): товари, історія, повідомлення, невідомі назви й межі переходять без втрат і
-- дублів; ціна й таймер зі старим id потрапляють до нового; псевдоніми лише читаються; merge_buyer — не для клієнтів.
-- Запуск: supabase/tests/run.sh (після seed каталогу). На порожній базі «М'яса» немає, тож перенесення перевіряється
-- на штучних скупниках t_from → t_to.
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', '{"full_name":"MergeUser"}')
  on conflict (id) do nothing;

create function public.test_err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
grant execute on function public.test_err(text) to anon, authenticated;   -- лише на час тесту, наприкінці видаляється

-- гравець з ніком і персонажем зі статіком — без них база ціну не прийме (0038)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \gset
update public.profiles set nick = 'MergeTester' where id = auth.uid();
insert into public.characters (name, static_id) values ('Merge_Tester', 400001);
reset role;

-- ---------- дані до злиття ----------
select set_config('request.jwt.claim.sub', '', false) \gset
insert into public.buyers (id, name, sort, next_change_at) values
  ('t_from', 'Тест: з', 90, now() + interval '5 hours'),
  ('t_to', 'Тест: до', 91, now() + interval '1 hour');
insert into public.items (name, category, sub, unit) values
  ('Злиття: спільний', 'res', 'Тест', 'шт'),
  ('Злиття: лише з', 'res', 'Тест', 'шт');
insert into public.buyer_items (buyer_id, item_id, price) select 't_to', id, 100 from public.items where name = 'Злиття: спільний';
insert into public.buyer_items (buyer_id, item_id, price) select 't_from', id, 200 from public.items where name = 'Злиття: спільний';
insert into public.buyer_items (buyer_id, item_id, price) select 't_from', id, 300 from public.items where name = 'Злиття: лише з';
insert into public.price_history (buyer_id, item_id, price, at)
  select b, id, 150, '2026-10-01T00:00:00Z' from public.items, (values ('t_from'), ('t_to')) v(b) where name = 'Злиття: спільний';
insert into public.price_history (buyer_id, item_id, price, at)
  select 't_from', id, 290, '2026-10-02T00:00:00Z' from public.items where name = 'Злиття: лише з';
insert into public.price_reports (kind, buyer_id, item_id, price, reporter)
  select 'buyer', 't_from', id, 310, '00000000-0000-0000-0000-0000000000e1' from public.items where name = 'Злиття: лише з';
insert into public.buyer_unknown_items (buyer_id, text, seen_count) values ('t_to', 'Злиття невідоме', 2), ('t_from', 'злиття невідоме', 3), ('t_from', 'Лише в старого', 1);
insert into public.buyer_limit_reports (buyer_id, item_id, price) select 't_from', id, 999 from public.items where name = 'Злиття: лише з';

-- psql не підставляє :змінні всередині $$ … $$ — числа «до» тримаємо в налаштуваннях сесії
select set_config('t.hist', count(*)::text, false) from public.price_history where buyer_id in ('t_from', 't_to') \gset
select set_config('t.only_at', coalesce(price_at::text, ''), false), set_config('t.only_price', price::text, false) from public.buyer_items
  where buyer_id = 't_from' and item_id = (select id from public.items where name = 'Злиття: лише з') \gset

-- ---------- злиття й повтор ----------
select public.merge_buyer('t_from', 't_to');
do $$ declare only_id bigint := (select id from public.items where name = 'Злиття: лише з');
              shared_id bigint := (select id from public.items where name = 'Злиття: спільний'); begin
  assert not exists (select 1 from public.buyers where id = 't_from'), 'старий скупник лишився';
  assert not exists (select 1 from public.buyer_items where buyer_id = 't_from'), 'товари лишились у старого';
  assert (select count(*) from public.buyer_items where buyer_id = 't_to') = 2, 'товарів у нового не 2';
  assert (select price from public.buyer_items where buyer_id = 't_to' and item_id = shared_id) = 100, 'спільний товар узяв ціну старого';
  assert (select price from public.buyer_items where buyer_id = 't_to' and item_id = only_id) = current_setting('t.only_price')::bigint, 'ціна перенесеного товару змінилась';
  assert (select count(*) from public.price_history where buyer_id = 't_to' and item_id = shared_id and at = '2026-10-01T00:00:00Z') = 1, 'однакова точка історії задублювалась';
  assert exists (select 1 from public.price_history where buyer_id = 't_to' and item_id = only_id and price = 290), 'історія не перейшла';
  assert exists (select 1 from public.price_reports where buyer_id = 't_to' and item_id = only_id and price = 310), 'повідомлення не перейшло';
  assert (select seen_count from public.buyer_unknown_items where buyer_id = 't_to' and lower(text) = 'злиття невідоме') = 5, 'лічильники однакової невідомої назви не злились';
  assert (select count(*) from public.buyer_unknown_items where buyer_id = 't_to') = 2, 'невідомі назви загубились або задублювались';
  assert exists (select 1 from public.buyer_limit_reports where buyer_id = 't_to' and item_id = only_id), 'підказка про межі не перейшла';
  assert (select next_change_at from public.buyers where id = 't_to') > now() + interval '4 hours', 'таймер — не пізніший з двох';
  assert (select buyer_id from public.buyer_aliases where alias = 't_from') = 't_to', 'псевдонім не записано';
end $$;
do $$ begin
  assert (select count(*) from public.price_history where buyer_id in ('t_from', 't_to')) = current_setting('t.hist')::int - 1, 'історія: нові точки або втрати при злитті';
end $$;
select public.merge_buyer('t_from', 't_to');   -- повтор: старого вже немає — нічого не робить
do $$ begin
  assert (select count(*) from public.price_history where buyer_id = 't_to') = current_setting('t.hist')::int - 1, 'повторне злиття змінило історію';
  assert (select price_at from public.buyer_items where buyer_id = 't_to' and item_id = (select id from public.items where name = 'Злиття: лише з'))
         is not distinct from nullif(current_setting('t.only_at'), '')::timestamptz, 'злиття переставило час ціни';
end $$;

-- ---------- гравець зі старим id ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \gset
-- своє внесення того ж товару за 10 хв замінюється — 310 з «до злиття» стане 320
insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 't_from', id, 320 from public.items where name = 'Злиття: лише з';
select public.set_next_change('t_from', now() + interval '20 hours');
do $$ declare e text; begin
  e := public.test_err($q$select public.report_unknown_item('t_from', 'Щось нове з гри')$q$);
  assert e = 'немає такого скупника', 'невідому назву зі старим id прийнято: ' || coalesce(e, 'без помилки');
  e := public.test_err($q$insert into public.buyer_aliases values ('x_user', 't_to')$q$);
  assert e like '%row-level security%' or e like 'permission denied%', 'гравець додав псевдонім: ' || coalesce(e, 'без помилки');
  update public.buyer_aliases set buyer_id = 'hide' where alias = 't_from';
  delete from public.buyer_aliases where alias = 't_from';
  assert public.test_err($q$select public.merge_buyer('t_to', 'hide')$q$) like 'permission denied%', 'гравець викликав merge_buyer';
end $$;
reset role;
do $$ begin
  assert (select buyer_id from public.price_reports where reporter = '00000000-0000-0000-0000-0000000000e1' and price = 320) = 't_to', 'ціна зі старим id не потрапила до нового скупника';
  assert (select next_change_at from public.buyers where id = 't_to') > now() + interval '19 hours', 'таймер зі старим id не змінив нового скупника';
  assert (select buyer_id from public.buyer_aliases where alias = 't_from') = 't_to', 'гравець змінив або видалив псевдонім';
end $$;

-- ---------- гість ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ declare e text; begin
  assert exists (select 1 from public.buyer_aliases where alias = 't_from'), 'гість не читає псевдоніми';
  e := public.test_err($q$insert into public.buyer_aliases values ('x_anon', 't_to')$q$);
  assert e like '%row-level security%' or e like 'permission denied%', 'гість додав псевдонім: ' || coalesce(e, 'без помилки');
  delete from public.buyer_aliases where alias = 't_from';
  assert public.test_err($q$select public.merge_buyer('t_to', 'hide')$q$) like 'permission denied%', 'гість викликав merge_buyer';
end $$;
reset role;

-- ---------- робоча база: «М'яса» немає ----------
do $$ begin
  assert exists (select 1 from public.buyer_aliases where alias = 't_from'), 'гість видалив псевдонім';
  assert not exists (select 1 from public.buyers where id = 'meat'), 'скупник «М''ясо» лишився';
  assert (select count(*) from public.buyer_items bi join public.items i on i.id = bi.item_id where i.sub = 'М''ясо' and bi.buyer_id <> 'hide') = 0, 'м''ясо не в «Шкурах»';
end $$;

-- прибирання
delete from public.price_reports where buyer_id = 't_to';
delete from public.buyers where id = 't_to';
delete from public.items where name in ('Злиття: спільний', 'Злиття: лише з');
delete from public.characters where owner = '00000000-0000-0000-0000-0000000000e1';
drop function public.test_err(text);
\echo 'Злиття скупників ok: товари, історія без дублів, повідомлення, невідомі назви й межі — до нового; ціна й таймер зі старим id — до нового; псевдоніми лише читаються; merge_buyer — не для клієнтів; повтор нічого не змінює'
