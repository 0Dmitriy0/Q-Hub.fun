-- Перевірка правил доступу на локальному Postgres з імітацією Supabase (auth.users, auth.uid(), ролі anon/authenticated).
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"full_name":"Dmitriy_Core"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"full_name":"Other_Player"}');

-- профілі створились тригером
do $$ begin assert (select count(*) from public.profiles) = 2, 'профілі не створились'; end $$;

-- гравець A створює персонажа й записи
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
insert into public.characters (name, start_balance) values ('Dmitriy_Core', 5085516);
insert into public.transactions (character_id, type, amount, category)
  select id, 'out', 150000, 'Перекуп' from public.characters;
insert into public.deals (character_id, op, item, qty, price, category)
  select id, 'buy', 'Stage 1', 1, 150000, 'tune' from public.characters;
do $$ begin assert (select count(*) from public.deals) = 1, 'A не бачить своєї угоди'; end $$;

-- A не може підняти собі роль
do $$ begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'роль змінилась — дірка';
  exception when insufficient_privilege then null;
  end;
end $$;

-- гравець B не бачить і не змінює даних A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \gset
do $$ begin
  assert (select count(*) from public.characters) = 0, 'B бачить персонажа A';
  assert (select count(*) from public.transactions) = 0, 'B бачить облік A';
  assert (select count(*) from public.deals) = 0, 'B бачить угоди A';
end $$;
update public.transactions set amount = 1;            -- RLS: 0 рядків
do $$ begin
  begin
    insert into public.deals (character_id, op, item, qty) select id, 'sell', 'X', 1 from public.characters limit 0;
    insert into public.deals (character_id, op, item, qty)
      values ((select id from public.characters limit 1), 'sell', 'X', 1);
    raise exception 'B вставив угоду без персонажа';
  exception when not_null_violation or check_violation or insufficient_privilege then null;
  end;
end $$;

-- B знає id персонажа A і пробує дописати йому угоду та транзакцію напряму
reset role;
select set_config('test.a_char', id::text, false) from public.characters limit 1 \gset
set role authenticated;
do $$ begin
  begin
    insert into public.deals (character_id, op, item, qty) values (current_setting('test.a_char')::uuid, 'sell', 'Злам', 1);
    raise exception 'B записав угоду в облік A';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.characters set owner = auth.uid() where id = current_setting('test.a_char')::uuid;
    if found then raise exception 'B переписав персонажа A на себе'; end if;
  end;
end $$;

-- каталог: читають усі, змінює лише редактор
do $$ begin
  assert (select count(*) from public.categories) = 9, 'категорії не видно';
  begin
    insert into public.items (name, category) values ('Хак', 'res');
    raise exception 'гравець змінив каталог';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ціни: три різні гравці → підтверджена медіана, викид відкинуто
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
insert into public.items (name, category) values ('Stage 1', 'tune');
insert into public.price_reports (item_id, kind, price, reporter)
  select i.id, 'sell', v.price, v.who::uuid from public.items i,
  (values (130000, '00000000-0000-0000-0000-00000000000a'), (140000, '00000000-0000-0000-0000-00000000000b'),
          (135000, '00000000-0000-0000-0000-00000000000c'), (1300000, '00000000-0000-0000-0000-00000000000d')) v(price, who)
  where i.name = 'Stage 1';
select set_config('request.jwt.claim.sub', '', false) \gset
set role anon;
do $$ declare r record; begin
  select * into r from public.prices_confirmed;
  assert r.reporters = 3, 'викид не відкинуто: ' || r.reporters;
  assert r.price = 135000, 'медіана ' || r.price;
  assert (select count(*) from public.price_reports) = 0, 'анонім бачить сирі звіти';
end $$;
reset role;

-- готівка й картка: картка й переказ приймаються, вигаданий рахунок чи джерело — ні
reset role;
do $$ declare ch uuid := (select id from public.characters limit 1); begin
  insert into public.transactions (character_id, type, amount, category, account, source) values (ch, 'out', 10, 'Переказ', 'card', 'transfer');
  assert (select account from public.transactions where source = 'transfer') = 'card', 'рахунок не записався';
  begin
    insert into public.transactions (character_id, type, amount, account) values (ch, 'in', 1, 'crypto');
    raise exception 'прийнято вигаданий рахунок';
  exception when check_violation then null;
  end;
  begin
    insert into public.transactions (character_id, type, amount, source) values (ch, 'in', 1, 'hack');
    raise exception 'прийнято вигадане джерело';
  exception when check_violation then null;
  end;
  delete from public.transactions where source = 'transfer';
end $$;

-- навчальні знімки: гравець кладе лише у свою теку й не бачить нічиїх знімків (навіть своїх — їх дивиться адмін)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
set role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name, owner) values ('training', '00000000-0000-0000-0000-00000000000a/buyer/1.jpg', auth.uid());
  begin
    insert into storage.objects (bucket_id, name, owner) values ('training', '00000000-0000-0000-0000-00000000000b/buyer/1.jpg', auth.uid());
    raise exception 'знімок записано в чужу теку';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from storage.objects where bucket_id = 'training') = 0, 'гравець бачить навчальні знімки';
end $$;
reset role;

-- ШІ-помічник: 50 запитів на добу (0027), лишок — assistant_left(), лічильник не видно й не змінити напряму, анонім не отримує нічого
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
set role authenticated;
do $$ begin
  assert public.assistant_left() = 50, 'на початку доби не 50 питань';
  for i in 1..50 loop assert public.assistant_take(), 'ліміт спрацював зарано: ' || i; end loop;
  assert public.assistant_left() = 0, 'після 50 питань лишок не 0';
  assert not public.assistant_take(), '51-й запит пройшов';
  assert (select count(*) from public.assistant_usage) = 0, 'лічильник видно гравцю';
  update public.assistant_usage set n = 0;
  assert not public.assistant_take(), 'лічильник скинуто напряму';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
set role anon;
do $$ begin
  begin
    perform public.assistant_take();
    raise exception 'анонім викликав помічника';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'RLS ok: власник бачить своє, інші — ні; роль не підняти; каталог лише для редакторів; ціна = медіана 3 гравців без викиду; ліміт ШІ'
