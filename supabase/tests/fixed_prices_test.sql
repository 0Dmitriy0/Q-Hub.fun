-- Фіксовані ціни скупника (0082, specs/096): прапорець і ліміт змінює лише staff; голоси гравців і програми відхиляються;
-- час зміни не вписується; staff ставить ціну вручну одразу; розбіжність з екрана — у «перевір межі».
-- Запуск: supabase/tests/run.sh (після seed каталогу — скупник 'fish' є)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000961', '{"full_name":"Fish Player"}'),
  ('00000000-0000-0000-0000-000000000962', '{"full_name":"Fish Admin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user', nick = coalesce(nick, 'FishPlayer') where id = '00000000-0000-0000-0000-000000000961';
update public.profiles set role = 'admin', nick = coalesce(nick, 'FishAdmin') where id = '00000000-0000-0000-0000-000000000962';
insert into public.characters (owner, name, static_id) values
  ('00000000-0000-0000-0000-000000000961', 'Fish_Player', 960001),
  ('00000000-0000-0000-0000-000000000962', 'Fish_Admin', 960002);

select set_config('test.fish', (select item_id from public.buyer_items where buyer_id = 'fish' order by item_id limit 1)::text, false) as f \gset
update public.buyer_items set price = 300, price_at = now() - interval '2 hours'
  where buyer_id = 'fish' and item_id = current_setting('test.fish')::bigint;
update public.buyers set next_change_at = now() + interval '3 hours' where id = 'fish';

-- гравець не вмикає фіксовані ціни й не змінює ліміт (RLS «скупників змінюють редактори» — 0 рядків)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000961', false) \gset
update public.buyers set fixed_prices = true, sale_limit = 1 where id = 'fish';
reset role;
do $$ begin
  assert not (select fixed_prices from public.buyers where id = 'fish'), 'гравець увімкнув фіксовані ціни';
  assert (select sale_limit from public.buyers where id = 'fish') is null, 'гравець змінив ліміт';
end $$;

-- admin вмикає: час наступної зміни обнуляється, ліміт записано
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000962', false) \gset
update public.buyers set fixed_prices = true, sale_limit = 5000, sale_limit_unit = 'кг' where id = 'fish';
reset role;
do $$ begin
  assert (select fixed_prices and sale_limit = 5000 and sale_limit_unit = 'кг' and next_change_at is null
          from public.buyers where id = 'fish'), 'admin не увімкнув фіксовані ціни або час не обнулився';
end $$;

-- одиниця ліміту — лише кг або шт
do $$ begin
  begin update public.buyers set sale_limit_unit = 'тонни' where id = 'fish'; raise exception 'прийнято одиницю «тонни»';
  exception when check_violation then null; end;
end $$;

-- гравець: ні голосу з сайту, ні з програми, ні часу зміни
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000961', false) \gset
do $$ declare m text; begin
  begin
    insert into public.price_reports (item_id, buyer_id, kind, price, source)
      values (current_setting('test.fish')::bigint, 'fish', 'buyer', 310, 'player');
    raise exception 'голос гравця прийнято';
  exception when raise_exception then get stacked diagnostics m = message_text;
    assert m like '%фіксовані ціни%', 'не та відмова: ' || m;
  end;
  begin
    insert into public.price_reports (item_id, buyer_id, kind, price, source)
      values (current_setting('test.fish')::bigint, 'fish', 'buyer', 310, 'desktop');
    raise exception 'голос програми прийнято';
  exception when raise_exception then get stacked diagnostics m = message_text;
    assert m like '%фіксовані ціни%', 'не та відмова програмі: ' || m;
  end;
  begin
    perform public.set_next_change('fish', now() + interval '2 hours');
    raise exception 'час зміни вписано';
  exception when raise_exception then get stacked diagnostics m = message_text;
    assert m like '%фіксовані ціни%', 'не та відмова часу: ' || m;
  end;
end $$;

-- розбіжність з екрана: інша ціна — рядок; та сама — відмова
select public.report_limit_mismatch('fish', current_setting('test.fish')::bigint, 333);
do $$ begin
  begin perform public.report_limit_mismatch('fish', current_setting('test.fish')::bigint, 300); raise exception 'прийнято ту саму ціну';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
  assert (select price from public.buyer_limit_reports where buyer_id = 'fish' and item_id = current_setting('test.fish')::bigint) = 333,
    'розбіжність не записалась';
  assert (select price from public.buyer_items where buyer_id = 'fish' and item_id = current_setting('test.fish')::bigint) = 300,
    'ціна змінилась від гравця';
end $$;

-- admin з програми — теж ні; вручну з сайту — одразу поточна
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000962', false) \gset
do $$ declare m text; begin
  begin
    insert into public.price_reports (item_id, buyer_id, kind, price, source)
      values (current_setting('test.fish')::bigint, 'fish', 'buyer', 320, 'desktop');
    raise exception 'голос admin з програми прийнято';
  exception when raise_exception then get stacked diagnostics m = message_text;
    assert m like '%фіксовані ціни%', 'не та відмова admin з програми: ' || m;
  end;
end $$;
insert into public.price_reports (item_id, buyer_id, kind, price, source)
  values (current_setting('test.fish')::bigint, 'fish', 'buyer', 333, 'player');
reset role;
do $$ begin
  assert (select price from public.buyer_items where buyer_id = 'fish' and item_id = current_setting('test.fish')::bigint) = 333,
    'ручне внесення admin не стало поточним';
end $$;

-- інші скупники — як раніше: час зміни гравець вписує
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000961', false) \gset
select public.set_next_change('hide', now() + interval '2 hours');
reset role;
do $$ begin
  assert (select next_change_at is not null from public.buyers where id = 'hide'), 'звичайний скупник зламався';
end $$;

-- прибрати за собою: наступні тести бачать звичайного скупника риби
update public.buyers set fixed_prices = false, sale_limit = null, sale_limit_unit = null, next_change_at = null where id = 'fish';
delete from public.buyer_limit_reports where buyer_id = 'fish';
delete from public.price_reports where buyer_id = 'fish' and reporter in
  ('00000000-0000-0000-0000-000000000961', '00000000-0000-0000-0000-000000000962');
\echo 'Фіксовані ціни ok'
