-- Гравці оновлюють поточну ціну скупника: межі, один раз за цикл, автор, історія, рейтинг.
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- гість не вносить ціну
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  begin
    insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 100 from public.items where name = 'Окунь';
    raise exception 'гість вніс ціну';
  exception when insufficient_privilege or not_null_violation then null;
  end;
end $$;

-- гравець B (звичайний, не редактор) вносить ціну Окуня (межі 35–267)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \gset
-- без ніка акаунта ціну не прийме (0038, specs/025)
do $$ begin
  begin
    insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 150 from public.items where name = 'Окунь';
    raise exception 'ціну прийнято без ніка';
  exception when raise_exception then
    if sqlerrm <> 'Спершу вибери нік акаунта.' then raise; end if;
  end;
end $$;
-- нік і персонажа зі статіком гравець вписує сам; роль собі не підніме
update public.profiles set nick = 'Ivan_P' where id = auth.uid();
do $$ begin
  begin
    insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 150 from public.items where name = 'Окунь';
    raise exception 'ціну прийнято без персонажа';
  exception when raise_exception then
    if sqlerrm <> 'Спершу додай персонажа.' then raise; end if;
  end;
end $$;
insert into public.characters (name, static_id) values ('Ivan_Petrov', 12345);
do $$ begin
  assert (select static_id from public.characters where owner = auth.uid()) = 12345, 'статік не зберігся';
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'гравець підняв собі роль';
  exception when insufficient_privilege then null;
  end;
end $$;
-- статік 777 — у персонажа гравця A (Dmitriy_Core з rls_test); чужий статік гравець не візьме
reset role;
update public.characters set static_id = 777 where owner = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
do $$ begin
  begin
    update public.characters set static_id = 777 where owner = auth.uid();
    raise exception 'взяв чужий статік';
  exception when raise_exception then
    if sqlerrm <> 'Статік 777 уже має інший персонаж.' then raise; end if;
  end;
end $$;
insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 150 from public.items where name = 'Окунь';
do $$ begin
  begin
    insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 9999 from public.items where name = 'Окунь';
    raise exception 'ціна поза межами пройшла';
  exception when raise_exception then
    if sqlerrm not like 'Ціна 9999 $ поза межами%' then raise; end if;
  end;
end $$;
-- виправлення впродовж 10 хв замінює попереднє
insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 160 from public.items where name = 'Окунь';
reset role;
-- один акаунт — один голос: ціна ще не поточна, видно «160 $ · 1 з 2» (0043, specs/029)
do $$ declare r record; begin
  select * into r from public.buyer_items where buyer_id = 'fish' and item_id = (select id from public.items where name = 'Окунь');
  assert r.price is distinct from 160, 'ціна одного гравця стала поточною';
  assert (select count(*) from public.price_reports where reporter = '00000000-0000-0000-0000-00000000000b' and kind = 'buyer') = 1, 'виправлення не замінило внесення';
  assert (select votes || '/' || need from public.price_pending where buyer_id = 'fish' and item_id = r.item_id and price = 160) = '1/2', 'немає варіанта «1 з 2»';
end $$;
-- другий акаунт з тією самою ціною — ціна поточна, автор — той, хто підтвердив
update public.profiles set nick = 'Dmitriy_A' where id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 160 from public.items where name = 'Окунь';
reset role;
do $$ declare r record; begin
  select * into r from public.buyer_items where buyer_id = 'fish' and item_id = (select id from public.items where name = 'Окунь');
  assert r.price = 160 and r.price_by = '00000000-0000-0000-0000-00000000000a', 'дві однакові ціни не стали поточною';
  assert r.price_at > now() - interval '1 minute', 'час ціни не оновився';
  assert (select bool_and(confirmed) from public.price_reports where kind = 'buyer' and item_id = r.item_id and price = 160), 'голоси не позначено підтвердженими';
  assert not exists (select 1 from public.price_pending where item_id = r.item_id and buyer_id = 'fish'), 'підтверджена ціна лишилась у «чекають»';
  assert exists (select 1 from public.price_history where price = 160 and by = '00000000-0000-0000-0000-00000000000a'), 'в історії немає автора';
end $$;
-- третій гравець ту саму свіжу ціну не «підтвердить» заради бала
insert into public.characters (owner, name, static_id) values ('00000000-0000-0000-0000-00000000000c', 'Petro_Cee', 90003);
update public.profiles set nick = 'Petro_C' where id = '00000000-0000-0000-0000-00000000000c';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \gset
do $$ begin
  begin
    insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 160 from public.items where name = 'Окунь';
    raise exception 'прийнято ту саму свіжу ціну';
  exception when raise_exception then
    if sqlerrm not like 'Ця ціна вже актуальна%' then raise; end if;
  end;
end $$;
reset role;

-- гість бачить «хто оновив» (нік акаунта й Ім'я_Прізвище персонажа, без статіку) і рейтинг
set role anon;
do $$ begin
  assert (select reporter_name || ' · ' || reporter_character from public.price_updates where reporter_name = 'Ivan_P' limit 1) = 'Ivan_P · Ivan_Petrov', 'немає ніка й персонажа в оновленнях';
  assert (select total from public.contributors where id = '00000000-0000-0000-0000-00000000000b') = 1, 'рейтинг рахує не так';
  assert (select week + month + year from public.contributors where id = '00000000-0000-0000-0000-00000000000b') = 3, 'рейтинг за періоди рахує не так';
end $$;
reset role;
\echo 'Ціни гравців ok: гість не вносить; межі ±10%; виправлення за 10 хв замінює, ціна одного акаунта чекає, друга така сама — поточна, третю таку саму свіжу не приймає; без ніка й персонажа не приймає, статік унікальний; видно нік і персонажа; автор у ціні, історії й рейтингу'

-- час наступної зміни цін: акаунт з ніком і персонажем зі статіком вписує, гість — ні, минулий час не приймається
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \gset
select public.set_next_change('fish', now() + interval '40 minutes');
do $$ begin
  begin perform public.set_next_change('fish', now() - interval '1 minute'); raise exception 'прийнято минулий час';
  exception when raise_exception then if sqlerrm not like 'Час наступної зміни%' then raise; end if; end;
end $$;
set role anon;
do $$ begin
  assert (select nick from public.buyer_next_change where buyer_id = 'fish') = 'Ivan_P', 'не видно, хто вписав час';
  assert (select next_change_at from public.buyer_next_change where buyer_id = 'fish') > now() + interval '39 minutes', 'час не збережено';
  begin perform public.set_next_change('fish', now() + interval '1 hour'); raise exception 'гість вписав час';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'Час наступної зміни ok: вписує гравець з ніком і статіком, видно хто; гість і минулий час — ні'

-- транспорт: читають усі, пишуть редактори; оцінка — одна від гравця, середню бачать усі
insert into public.vehicles (kind, name, brand, price) values ('auto', 'Test Car', 'Test', 100000), ('moto', 'Test Bike', 'Test', 5000);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \gset
insert into public.vehicle_ratings (vehicle_id, stars) select id, 4 from public.vehicles where name = 'Test Car';
insert into public.vehicle_ratings (vehicle_id, stars) select id, 2 from public.vehicles where name = 'Test Car'
  on conflict (vehicle_id, user_id) do update set stars = excluded.stars, updated_at = now();
do $$ begin
  begin insert into public.vehicles (kind, name) values ('auto', 'Hack'); raise exception 'гравець додав транспорт';
  exception when insufficient_privilege then null; end;
  begin insert into public.vehicle_ratings (vehicle_id, user_id, stars) select id, '00000000-0000-0000-0000-00000000000a', 5 from public.vehicles where name = 'Test Car'; raise exception 'оцінив за іншого';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
insert into public.vehicle_ratings (vehicle_id, stars) select id, 5 from public.vehicles where name = 'Test Car';
set role anon;
do $$ begin
  assert (select avg || '/' || votes from public.vehicle_scores s join public.vehicles v on v.id = s.vehicle_id where v.name = 'Test Car') = '3.50/2', 'середня оцінка не та';
  assert (select count(*) from public.vehicle_ratings) = 0, 'гість бачить окремі оцінки';
end $$;
reset role;
delete from public.vehicles where name like 'Test %';
\echo 'Транспорт ok: читають усі, пишуть редактори; одна оцінка від гравця (змінюється), середню бачать усі'

-- фото транспорту: редактор не ставить, адмін ставить
insert into public.vehicles (kind, name) values ('auto', 'Pic Car');
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \gset
do $$ begin
  begin update public.vehicles set image_url = 'x' where name = 'Pic Car'; raise exception 'редактор поставив фото транспорту';
  exception when raise_exception then if sqlerrm <> 'Картинки змінює лише адмін.' then raise; end if; end;
end $$;
reset role;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
update public.vehicles set image_url = 'https://x/v.webp' where name = 'Pic Car';
reset role;
do $$ begin assert (select image_url from public.vehicles where name = 'Pic Car') = 'https://x/v.webp', 'адмін не поставив фото'; end $$;
delete from public.vehicles where name = 'Pic Car';
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-00000000000b';
\echo 'Фото транспорту ok: ставить лише адмін'
