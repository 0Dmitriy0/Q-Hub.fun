-- Каталог з хабу і ціни редакторів: хто що може змінити.
\set ON_ERROR_STOP on
set client_min_messages = warning;
do $$ begin
  assert (select count(*) from public.buyers) = 10, 'скупників не 10';
  assert (select count(*) from public.buyer_items) = 122, 'повторний імпорт дублює рядки';
  assert (select count(*) from public.buyer_items where price > 0) = 59, 'не всі ціни власника';
  assert (select unit from public.items where name = 'Окунь') = 'кг', 'риба не в кг';
  assert (select count(*) from public.buyer_items where min_price > 0 and max_price > min_price) = 108, 'не всі межі скупників';
  assert (select min_price || '-' || max_price from public.buyer_items where buyer_id = 'mush' and item_id = (select id from public.items where name = 'Цар-гриб')) = '3010-5996', 'межі не ті';
  assert (select count(distinct (buyer_id, item_id)) from public.price_history) = 59, 'історія не для всіх цін власника';
  assert (select count(*) from public.price_history) >= 72, 'точки історії з хабу не всі';
  assert (select count(*) from (select 1 from public.price_history group by buyer_id, item_id, at, price having count(*) > 1) d) = 0, 'історія дублюється';
end $$;
select set_config('t.hist', count(*)::text, false) from public.price_history \gset

-- звичайний гравець не змінює ціну і не вантажить картинки
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \gset
do $$ begin
  update public.buyer_items set price = 1 where buyer_id = 'fish';
  assert (select count(*) from public.buyer_items where price = 1) = 0, 'гравець змінив ціну скупника';
  begin
    insert into storage.objects (bucket_id, name) values ('catalog', 'x.webp');
    raise exception 'гравець завантажив картинку';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.price_history (buyer_id, item_id, price) select 'fish', id, 1 from public.items where name = 'Окунь';
    raise exception 'гравець дописав історію цін';
  exception when insufficient_privilege then null;
  end;
end $$;

-- редактор змінює ціну: база сама ставить час і автора, оновлює час скупника
reset role;
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
update public.buyer_items set price = 177 where buyer_id = 'fish' and item_id = (select id from public.items where name = 'Окунь');
-- редактор картинки вже не вантажить і не міняє — це лише для адміна
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('catalog', 'buyers/fish.webp');
    raise exception 'редактор завантажив картинку';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.buyers set image_url = 'x' where id = 'fish';
    raise exception 'редактор змінив картинку';
  exception when raise_exception then
    if sqlerrm <> 'Картинки змінює лише адмін.' then raise; end if;
  end;
end $$;
reset role;
-- адмін: вантажить, бачить свій файл (потрібно для заміни) і ставить адресу
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
insert into storage.objects (bucket_id, name) values ('catalog', 'buyers/fish.webp');
do $$ begin
  assert (select count(*) from storage.objects where name = 'buyers/fish.webp') = 1, 'адмін не бачить свою картинку — заміна не спрацює';
end $$;
update public.buyers set image_url = 'https://x/fish.webp' where id = 'fish';
reset role;
do $$ begin assert (select image_url from public.buyers where id = 'fish') = 'https://x/fish.webp', 'адмін не поставив картинку'; end $$;
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-00000000000a';
do $$ declare r record; begin
  select bi.price, bi.price_by, bi.price_at, b.updated_at into r
    from public.buyer_items bi join public.buyers b on b.id = bi.buyer_id
    where bi.buyer_id = 'fish' and bi.item_id = (select id from public.items where name = 'Окунь');
  assert r.price = 177 and r.price_by = '00000000-0000-0000-0000-00000000000a', 'автор ціни не записаний';
  assert r.price_at > now() - interval '1 minute' and r.updated_at > now() - interval '1 minute', 'час не оновився';
end $$;
do $$ begin
  assert (select count(*) from public.price_history) = current_setting('t.hist')::int + 1, 'зміна ціни не потрапила в історію';
  assert exists (select 1 from public.price_history where buyer_id = 'fish' and price = 177 and at > now() - interval '1 minute'), 'нової точки 177 немає';
end $$;
\echo 'Каталог ok: 10 скупників, 122 товари, 59 цін власника, межі мін/макс для 108; повтор без дублів; ціну змінює лише редактор, картинки — лише адмін; кожна зміна ціни йде в історію'
