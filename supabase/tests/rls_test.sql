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
\echo 'RLS ok: власник бачить своє, інші — ні; роль не підняти; каталог лише для редакторів; ціна = медіана 3 гравців без викиду'
