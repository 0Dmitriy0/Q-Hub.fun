-- Discord-бот (0055, specs/060): таблиці бота — лише admin (anon, user, editor, moderator — ні читання, ні запису);
-- check-обмеження; тригер черги з price_history (лише коли prices_on). Запуск: supabase/tests/run.sh (після seed каталогу)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000060b01', '{"full_name":"BotUser"}'),
  ('00000000-0000-0000-0000-000000060b02', '{"full_name":"BotEditor"}'),
  ('00000000-0000-0000-0000-000000060b03', '{"full_name":"BotModer"}'),
  ('00000000-0000-0000-0000-000000060b04', '{"full_name":"BotBoss"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-000000060b01';
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-000000060b02';
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-000000060b03';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000060b04';

create function public.test_bot_try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok';
exception when others then return sqlstate; end $$;
grant execute on function public.test_bot_try(text) to anon, authenticated;

-- 1) не-адмін: читання нічого не дає (RLS) або відмова, запис — відмова
create function public.test_bot_denied() returns void language plpgsql as $$
declare t text; q text; n int;
begin
  foreach t in array array['discord_bot', 'discord_outbox', 'discord_posts', 'news_drafts'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      assert n = 0, 'не-адмін бачить рядки ' || t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  -- insert — відмова (немає grant або with check); update / delete без видимих рядків — 0 рядків, перевіряємо нижче
  foreach q in array array[
    'insert into public.discord_posts (key, channel_id, status) values (''test:x'', ''123456789012345678'', ''sent'')',
    'insert into public.news_drafts (source_ref, title) values (''manual:x'', ''Х'')',
    'insert into public.discord_outbox (buyer_id, item_id, price, at) values (''hide'', 1, 1, now())'] loop
    assert public.test_bot_try(q) = '42501', 'не-адмін вставив: ' || q;
  end loop;
  perform public.test_bot_try('update public.discord_bot set prices_on = true');
  perform public.test_bot_try('delete from public.discord_bot');
end $$;
grant execute on function public.test_bot_denied() to anon, authenticated;

set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select public.test_bot_denied();
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000060b01', false) \gset
select public.test_bot_denied();
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000060b02', false) \gset
select public.test_bot_denied();
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000060b03', false) \gset
select public.test_bot_denied();
reset role;
-- update без видимих рядків «проходить» як 0 рядків — переконуємось, що він нічого не змінив
do $$ begin assert not (select prices_on from public.discord_bot), 'не-адмін увімкнув ціни'; end $$;
do $$ begin assert (select count(*) from public.discord_bot) = 1, 'не-адмін видалив налаштування бота'; end $$;

-- 2) admin читає й пише всі чотири
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000060b04', false) \gset
do $$ begin
  assert (select count(*) from public.discord_bot) = 1, 'admin не бачить налаштування бота';
  update public.discord_bot set guild_id = '123456789012345678', prices_channel_id = '123456789012345679', window_min = 5;
  assert (select guild_id from public.discord_bot) = '123456789012345678', 'admin не змінив налаштування';
  insert into public.discord_posts (key, channel_id, status) values ('test:admin', '123456789012345679', 'sent');
  insert into public.news_drafts (source_ref, title, added) values ('manual:admin', 'Нове', array['Пункт']);
  update public.news_drafts set status = 'skipped' where source_ref = 'manual:admin';
  delete from public.news_drafts where source_ref = 'manual:admin';
  delete from public.discord_posts where key = 'test:admin';
  perform count(*) from public.discord_outbox;
end $$;

-- 3) check-обмеження (як admin)
create function public.test_bot_check() returns void language plpgsql as $$
declare q text;
begin
  foreach q in array array[
    'insert into public.discord_bot (id) values (false)',
    'insert into public.discord_bot (id) values (true)',
    'update public.discord_bot set guild_id = ''abc''',
    'update public.discord_bot set prices_channel_id = ''1234''',
    'update public.discord_bot set news_channel_id = ''123456789012345678901''',
    'update public.discord_bot set window_min = 0',
    'update public.discord_bot set window_min = 61',
    'update public.discord_bot set crosspost_per_hour = 0',
    'update public.discord_bot set crosspost_per_hour = 51',
    'update public.discord_bot set last_error = repeat(''x'', 501)',
    'insert into public.discord_posts (key, channel_id, status) values (''test:bad'', ''1'', ''done'')',
    'insert into public.discord_posts (key, channel_id, status, error) values (''test:bad'', ''1'', ''failed'', repeat(''x'', 501))',
    'insert into public.news_drafts (source_ref, title) values (''manual:t0'', '''')',
    'insert into public.news_drafts (source_ref, title) values (''manual:t1'', repeat(''x'', 121))',
    'insert into public.news_drafts (source_ref, title, added) values (''manual:t2'', ''Т'', array[repeat(''x'', 301)])',
    'insert into public.news_drafts (source_ref, title, changed) values (''manual:t3'', ''Т'', array[''ok'', repeat(''x'', 301)])',
    'insert into public.news_drafts (source_ref, title, removed) values (''manual:t4'', ''Т'', array[repeat(''x'', 301)])',
    'insert into public.news_drafts (source_ref, title, image_url) values (''manual:t5'', ''Т'', ''http://x'')',
    'insert into public.news_drafts (source_ref, title, link) values (''manual:t6'', ''Т'', ''javascript:alert(1)'')',
    'insert into public.news_drafts (source_ref, title, status) values (''manual:t7'', ''Т'', ''published'')'] loop
    assert public.test_bot_try(q) <> 'ok', 'обмеження пропустило: ' || q;
  end loop;
  insert into public.news_drafts (source_ref, title) values ('manual:dup', 'Т');
  assert public.test_bot_try('insert into public.news_drafts (source_ref, title) values (''manual:dup'', ''Т2'')') = '23505', 'дубль source_ref пройшов';
  delete from public.news_drafts where source_ref = 'manual:dup';
  -- допустимі значення проходять
  update public.discord_bot set guild_id = '', news_channel_id = '12345678901234567', window_min = 60, crosspost_per_hour = 50;
  update public.discord_bot set window_min = 5, crosspost_per_hour = 10, news_channel_id = '';
end $$;
select public.test_bot_check();
reset role;

-- 4) тригер черги: лише коли prices_on; prev_price — попередня ціна з історії
select set_config('test.bit', (select item_id from public.buyer_items where buyer_id = 'hide' order by item_id offset 6 limit 1)::text, false) as bit \gset
select coalesce(price, 0) as bot_old_price, coalesce(price_at::text, '') as bot_old_at, coalesce(min_price, 0) as bot_old_min, coalesce(max_price, 0) as bot_old_max
  from public.buyer_items where buyer_id = 'hide' and item_id = current_setting('test.bit')::bigint \gset
update public.buyer_items set min_price = 0, max_price = 0 where buyer_id = 'hide' and item_id = current_setting('test.bit')::bigint;
delete from public.discord_outbox;
update public.discord_bot set prices_on = false;
update public.buyer_items set price = 6001, price_at = now() - interval '3 minutes' where buyer_id = 'hide' and item_id = current_setting('test.bit')::bigint;
do $$ begin assert (select count(*) from public.discord_outbox) = 0, 'черга наповнилась при вимкнених цінах'; end $$;

update public.discord_bot set prices_on = true;
update public.buyer_items set price = 6050, price_at = now() - interval '2 minutes' where buyer_id = 'hide' and item_id = current_setting('test.bit')::bigint;
do $$
declare o public.discord_outbox;
begin
  assert (select count(*) from public.discord_outbox) = 1, 'зміна ціни не дала рівно одну подію';
  select * into o from public.discord_outbox;
  assert o.buyer_id = 'hide' and o.item_id = current_setting('test.bit')::bigint, 'подія не про той предмет';
  assert o.price = 6050 and o.prev_price = 6001, format('ціна %s / попередня %s, очікували 6050 / 6001', o.price, o.prev_price);
  assert o.post_key is null and o.posted_at is null, 'нова подія вже позначена опублікованою';
end $$;

-- перша ціна предмета в історії — prev_price null («нове»)
select set_config('test.bit2', (select i.id from public.items i where not exists (select 1 from public.buyer_items b where b.buyer_id = 'hide' and b.item_id = i.id) order by i.id limit 1)::text, false) as bit2 \gset
delete from public.price_history where buyer_id = 'hide' and item_id = current_setting('test.bit2')::bigint;
insert into public.buyer_items (buyer_id, item_id, price, price_at) values ('hide', current_setting('test.bit2')::bigint, 777, now() - interval '1 minute');
do $$ begin
  assert (select prev_price is null from public.discord_outbox where item_id = current_setting('test.bit2')::bigint), 'перша ціна має prev_price null';
end $$;

-- видалення скупника каскадом прибирає його події
delete from public.buyer_items where buyer_id = 'hide' and item_id = current_setting('test.bit2')::bigint;
delete from public.price_history where buyer_id = 'hide' and item_id = current_setting('test.bit2')::bigint;
insert into public.buyers (id, name, sort) values ('test_bot_buyer', 'Тестовий скупник бота', 999);
insert into public.buyer_items (buyer_id, item_id, price, price_at) values ('test_bot_buyer', current_setting('test.bit')::bigint, 500, now());
do $$ begin assert exists (select 1 from public.discord_outbox where buyer_id = 'test_bot_buyer'), 'немає події нового скупника'; end $$;
delete from public.buyers where id = 'test_bot_buyer';
do $$ begin assert not exists (select 1 from public.discord_outbox where buyer_id = 'test_bot_buyer'), 'події видаленого скупника лишились'; end $$;

-- прибрати за собою
update public.discord_bot set prices_on = false, guild_id = '', prices_channel_id = '';
delete from public.discord_outbox;
delete from public.price_history where buyer_id = 'hide' and item_id = current_setting('test.bit')::bigint and price in (6001, 6050);
update public.buyer_items set price = :bot_old_price, price_at = nullif(:'bot_old_at', '')::timestamptz,
  min_price = :bot_old_min, max_price = :bot_old_max
  where buyer_id = 'hide' and item_id = current_setting('test.bit')::bigint;
drop function public.test_bot_denied();
drop function public.test_bot_check();
drop function public.test_bot_try(text);
\echo 'Discord-бот ok'
