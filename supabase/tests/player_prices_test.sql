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
-- без статіка ціну не прийме
do $$ begin
  begin
    insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 150 from public.items where name = 'Окунь';
    raise exception 'ціну прийнято без статіка';
  exception when raise_exception then
    if sqlerrm <> 'Спершу вкажи нік персонажа і статік у профілі.' then raise; end if;
  end;
end $$;
-- статік вписує сам гравець; чужий (уже зайнятий) не візьме, роль собі не підніме
update public.profiles set static_id = 12345, game_name = 'Ivan_Petrov' where id = auth.uid();
do $$ begin
  assert (select static_id from public.profiles where id = auth.uid()) = 12345, 'статік не зберігся';
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'гравець підняв собі роль';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.profiles set static_id = 777 where id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
do $$ begin
  begin
    update public.profiles set static_id = 777 where id = auth.uid();
    raise exception 'взяв чужий статік';
  exception when unique_violation then null;
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
do $$ declare r record; begin
  select * into r from public.buyer_items where buyer_id = 'fish' and item_id = (select id from public.items where name = 'Окунь');
  assert r.price = 160 and r.price_by = '00000000-0000-0000-0000-00000000000b', 'ціна гравця не стала поточною';
  assert r.price_at > now() - interval '1 minute', 'час ціни не оновився';
  assert (select count(*) from public.price_reports where reporter = '00000000-0000-0000-0000-00000000000b' and kind = 'buyer') = 1, 'виправлення не замінило внесення';
  assert exists (select 1 from public.price_history where price = 160 and by = '00000000-0000-0000-0000-00000000000b'), 'в історії немає автора';
end $$;
-- інший гравець ту саму свіжу ціну не «підтвердить» заради бала
update public.profiles set game_name = 'Dmitriy_Core' where id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
do $$ begin
  begin
    insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 160 from public.items where name = 'Окунь';
    raise exception 'прийнято ту саму свіжу ціну';
  exception when raise_exception then
    if sqlerrm not like 'Ця ціна вже актуальна%' then raise; end if;
  end;
end $$;
reset role;

-- гість бачить «хто оновив» і рейтинг, але лише ім'я
set role anon;
do $$ begin
  assert (select reporter_game || ' #' || reporter_static from public.price_updates order by created_at desc limit 1) = 'Ivan_Petrov #12345', 'немає ніка персонажа і статіка в оновленнях';
  assert (select total from public.contributors where id = '00000000-0000-0000-0000-00000000000b') = 1, 'рейтинг рахує не так';
  assert (select week + month + year from public.contributors where id = '00000000-0000-0000-0000-00000000000b') = 3, 'рейтинг за періоди рахує не так';
end $$;
reset role;
\echo 'Ціни гравців ok: гість не вносить; межі ±10%; виправлення за 10 хв замінює, ту саму свіжу ціну не приймає; без ніка й статіка не приймає, статік унікальний; видно нік персонажа і статік; автор у ціні, історії й рейтингу'

-- час наступної зміни цін: гравець із ніком і статіком вписує, гість — ні, минулий час не приймається
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \gset
select public.set_next_change('fish', now() + interval '40 minutes');
do $$ begin
  begin perform public.set_next_change('fish', now() - interval '1 minute'); raise exception 'прийнято минулий час';
  exception when raise_exception then if sqlerrm not like 'Час наступної зміни%' then raise; end if; end;
end $$;
set role anon;
do $$ begin
  assert (select game_name || ' #' || static_id from public.buyer_next_change where buyer_id = 'fish') = 'Ivan_Petrov #12345', 'не видно, хто вписав час';
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
