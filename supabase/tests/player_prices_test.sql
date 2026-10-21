-- Гравці оновлюють поточну ціну скупника: межі, один раз за цикл, автор, історія, рейтинг.
\set ON_ERROR_STOP on
set client_min_messages = warning;
do $$ begin
  assert public.price_cycle_start('2026-10-21 16:30+03') = '2026-10-21 15:00+03', 'цикл 15:00–18:00';
  assert public.price_cycle_start('2026-10-21 02:59+03') = '2026-10-21 00:00+03', 'цикл з півночі';
end $$;

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
insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 150 from public.items where name = 'Окунь';
do $$ begin
  begin
    insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 9999 from public.items where name = 'Окунь';
    raise exception 'ціна поза межами пройшла';
  exception when raise_exception then
    if sqlerrm not like 'Ціна 9999 $ поза межами%' then raise; end if;
  end;
end $$;
-- виправлення в тому ж циклі замінює попереднє
insert into public.price_reports (kind, buyer_id, item_id, price) select 'buyer', 'fish', id, 160 from public.items where name = 'Окунь';
reset role;
do $$ declare r record; begin
  select * into r from public.buyer_items where buyer_id = 'fish' and item_id = (select id from public.items where name = 'Окунь');
  assert r.price = 160 and r.price_by = '00000000-0000-0000-0000-00000000000b', 'ціна гравця не стала поточною';
  assert r.price_at > now() - interval '1 minute', 'час ціни не оновився';
  assert (select count(*) from public.price_reports where reporter = '00000000-0000-0000-0000-00000000000b' and kind = 'buyer') = 1, 'виправлення не замінило внесення';
  assert exists (select 1 from public.price_history where price = 160 and by = '00000000-0000-0000-0000-00000000000b'), 'в історії немає автора';
end $$;

-- гість бачить «хто оновив» і рейтинг, але лише ім'я
set role anon;
do $$ begin
  assert (select reporter_name from public.price_updates order by created_at desc limit 1) <> '', 'немає імені в оновленнях';
  assert (select total from public.contributors where id = '00000000-0000-0000-0000-00000000000b') = 1, 'рейтинг рахує не так';
  assert (select week + month + year from public.contributors where id = '00000000-0000-0000-0000-00000000000b') = 3, 'рейтинг за періоди рахує не так';
end $$;
reset role;
\echo 'Ціни гравців ok: цикл 3 год; гість не вносить; межі ±10%; один раз за цикл (виправлення замінює); автор у ціні, історії й рейтингу'
