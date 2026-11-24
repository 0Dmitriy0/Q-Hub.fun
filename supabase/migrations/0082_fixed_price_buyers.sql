-- Q-Hub: скупник із фіксованими цінами (specs/096). Оновлення рибалки в грі (до 23.11.2026): скупник риби купує 20 видів,
-- ціни за кг фіксовані — не змінюються за розкладом, таймера «до зміни цін» немає; ліміт продажу 5000 кг.
-- • buyers.fixed_prices — ціну ставить лише staff (ручне внесення, одразу поточна, 0043); голоси гравців і програми
--   відхиляються (черга програми отримує «denied» і викидає запис, outbox.cjs); set_next_change відмовляє.
-- • buyers.sale_limit / sale_limit_unit — довідка «Ліміт продажу»; змінює staff (наявна політика «скупників змінюють редактори»).
-- • report_limit_mismatch для фіксованого скупника — «на екрані інша ціна»: адмін бачить у «перевір межі».
-- • Дані: 6 нових риб (Короп, Щука, Сом, Лосось, Мурена, Осетр) і 20 цін зі знімків власника від 24.11.2026 00:25.
-- Залежить від 0003 (історія), 0038/0040 (set_next_change), 0054 (check_buyer_report, report_limit_mismatch).
-- Файл можна запускати повторно.

-- ---------- схема ----------
alter table public.buyers
  add column if not exists fixed_prices boolean not null default false,
  add column if not exists sale_limit numeric,
  add column if not exists sale_limit_unit text;

do $$ begin
  alter table public.buyers add constraint buyers_sale_limit_check check (sale_limit is null or sale_limit > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.buyers add constraint buyers_sale_limit_unit_check
    check (sale_limit_unit is null or sale_limit_unit in ('кг', 'шт'));
exception when duplicate_object then null; end $$;

-- увімкнули фіксовані ціни — час наступної зміни більше нічого не означає
create or replace function public.buyers_fixed_clear_next() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.fixed_prices and not coalesce(old.fixed_prices, false) then
    new.next_change_at := null;
    new.next_change_by := null;
  end if;
  return new;
end $$;
drop trigger if exists buyers_fixed_clear_next on public.buyers;
create trigger buyers_fixed_clear_next before update of fixed_prices on public.buyers
  for each row execute function public.buyers_fixed_clear_next();

-- ---------- таймер: тіло з 0040 + відмова для фіксованого скупника ----------
create or replace function public.set_next_change(p_buyer text, p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare pr public.profiles;
begin
  if auth.uid() is null then raise exception 'Спершу увійди через Discord.'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if coalesce(btrim(pr.nick), '') = '' then raise exception 'Спершу вибери нік акаунта.'; end if;
  if not exists (select 1 from public.characters where owner = auth.uid() and static_id is not null) then
    raise exception 'Спершу додай персонажа зі статіком.';
  end if;
  if p_at <= now() or p_at > now() + interval '24 hours' then
    raise exception 'Час наступної зміни має бути в найближчі 24 години.';
  end if;
  p_buyer := coalesce((select buyer_id from public.buyer_aliases where alias = p_buyer), p_buyer);
  if (select fixed_prices from public.buyers where id = p_buyer) then
    raise exception 'У цього скупника фіксовані ціни — час зміни не потрібен.';
  end if;
  update public.buyers set next_change_at = p_at, next_change_by = auth.uid() where id = p_buyer;
  if not found then raise exception 'Немає такого скупника.'; end if;
end $$;

-- ---------- внесення ціни: тіло з 0054 + фіксований скупник лише від staff вручну ----------
create or replace function public.check_buyer_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bi public.buyer_items; staff boolean := public.is_staff(); pr public.profiles; ch public.characters; n int;
  lim boolean;
begin
  if new.kind <> 'buyer' then return new; end if;
  select * into bi from public.buyer_items where buyer_id = new.buyer_id and item_id = new.item_id;
  if not found then raise exception 'У цього скупника немає такого товару.'; end if;
  if (select fixed_prices from public.buyers where id = new.buyer_id)
     and not (staff and new.source is distinct from 'desktop') then
    raise exception 'У цього скупника фіксовані ціни — їх оновлює адміністрація.';
  end if;
  if new.reporter is not null then
    select * into pr from public.profiles where id = new.reporter;
    if coalesce(btrim(pr.nick), '') = '' then raise exception 'Спершу вибери нік акаунта.'; end if;
    if new.character_id is null then
      select count(*) into n from public.characters where owner = new.reporter;
      if n = 0 then raise exception 'Спершу додай персонажа.'; end if;
      if n > 1 then raise exception 'Обери персонажа, з якого вписуєш ціну.'; end if;
      new.character_id := (select id from public.characters where owner = new.reporter);
    end if;
    select * into ch from public.characters where id = new.character_id;
    if not found or ch.owner <> new.reporter then raise exception 'Цей персонаж не твій.'; end if;
    if ch.static_id is null then raise exception 'Вкажи статік персонажа %.', ch.name; end if;
  end if;
  lim := bi.min_price > 0 and bi.max_price > bi.min_price;
  if new.out_of_limits then
    if new.source is distinct from 'desktop' or not lim then
      raise exception 'Голос поза межами — лише з програми й для товару з межами.';
    end if;
    if new.price < bi.min_price * 0.5 or new.price > bi.max_price * 1.5 then
      raise exception 'Ціна % $ надто далеко від меж скупника (% – % $). Перевір число.', new.price, bi.min_price, bi.max_price;
    end if;
  elsif (not staff or new.source = 'desktop') and lim
     and (new.price < bi.min_price * 0.9 or new.price > bi.max_price * 1.1) then
    raise exception 'Ціна % $ поза межами скупника (% – % $). Перевір число.', new.price, bi.min_price, bi.max_price;
  end if;
  if not staff and (select count(*) from public.price_reports
                    where reporter = new.reporter and created_at > now() - interval '1 hour') >= 120 then
    raise exception 'Забагато внесень за годину. Спробуй трохи пізніше.';
  end if;
  new.created_at := now();
  new.cycle := null;
  -- виправлення: своє внесення того ж товару за останні 10 хв замінюється новим
  delete from public.price_reports
    where kind = 'buyer' and reporter = new.reporter and buyer_id = new.buyer_id and item_id = new.item_id
      and created_at > now() - interval '10 minutes';
  if found then return new; end if;
  if new.price = bi.price and bi.price_at > now() - interval '30 minutes' then
    raise exception 'Ця ціна вже актуальна — її оновили менше ніж 30 хв тому.';
  end if;
  return new;
end $$;

-- ---------- «перевір межі»: тіло з 0054 + для фіксованого скупника — будь-яка ціна, інша за поточну ----------
create or replace function public.report_limit_mismatch(p_buyer text, p_item bigint, p_price bigint) returns void
language plpgsql security definer set search_path = public as $$
declare bi public.buyer_items; fixed boolean;
begin
  if auth.uid() is null then raise exception 'потрібен вхід' using errcode = '42501'; end if;
  select * into bi from public.buyer_items where buyer_id = p_buyer and item_id = p_item;
  if not found then raise exception 'немає такого товару в скупника' using errcode = '22023'; end if;
  fixed := coalesce((select b.fixed_prices from public.buyers b where b.id = p_buyer), false);
  if fixed then
    if coalesce(p_price, 0) <= 0 or p_price = bi.price then
      raise exception 'ціна збігається з фіксованою' using errcode = '22023';
    end if;
  elsif coalesce(p_price, 0) <= 0 or not (bi.min_price > 0 and bi.max_price > bi.min_price)
     or p_price between bi.min_price and bi.max_price then
    raise exception 'ціна не поза межами' using errcode = '22023';
  end if;
  /* інша ціна, ніж була в рядку, — лік акаунтів з нуля: рахуються ті, хто бачив саме цю ціну */
  insert into public.buyer_limit_reports (buyer_id, item_id, price, reported_by, reporters)
    values (p_buyer, p_item, p_price, auth.uid(), array[auth.uid()])
    on conflict (buyer_id, item_id) do update set
      seen_count = buyer_limit_reports.seen_count + 1, last_seen = now(), reported_by = excluded.reported_by,
      reporters = case
        when buyer_limit_reports.price <> excluded.price then excluded.reporters
        when auth.uid() = any (buyer_limit_reports.reporters) then buyer_limit_reports.reporters
        else buyer_limit_reports.reporters || auth.uid() end,
      price = excluded.price;
end $$;

revoke all on function public.report_limit_mismatch(text, bigint, bigint) from public, anon;
grant execute on function public.report_limit_mismatch(text, bigint, bigint) to authenticated;

-- ---------- дані: скупник риби ----------
-- нові види: у базі риба — категорія res, підкатегорія «Риба», кг, іконка /icons/fish/<файл>.svg (як у 14 наявних)
insert into public.items (name, category, sub, unit, image_url) values
  ('Короп',  'res', 'Риба', 'кг', '/icons/fish/carp.svg'),
  ('Щука',   'res', 'Риба', 'кг', '/icons/fish/pike.svg'),
  ('Сом',    'res', 'Риба', 'кг', '/icons/fish/catfish.svg'),
  ('Лосось', 'res', 'Риба', 'кг', '/icons/fish/salmon.svg'),
  ('Мурена', 'res', 'Риба', 'кг', '/icons/fish/moray.svg'),
  ('Осетр',  'res', 'Риба', 'кг', '/icons/fish/sturgeon.svg')
  on conflict (name) do nothing;

insert into public.buyer_items (buyer_id, item_id)
  select b.id, i.id from public.items i
  join public.buyers b on b.id = 'fish'   -- на порожній базі (CI) скупників ще немає: тоді нічого не вставляємо
  where i.name in ('Короп', 'Щука', 'Сом', 'Лосось', 'Мурена', 'Осетр')
  on conflict do nothing;

-- 20 цін зі знімків 24.11.2026 00:25 (Київ). Лише ті, що відрізняються: незмінна ціна не пише точку в історію
update public.buyer_items bi set price = v.price, price_at = '2026-11-24 00:25:00+02'
from (values
  ('Оселедець', 157), ('Форель', 183), ('Короп', 197), ('Окунь', 210), ('Тунець', 220),
  ('Тріска', 252), ('Скумбрія', 260), ('Щука', 307), ('Дорадо', 345), ('Камбала', 405),
  ('Кефаль', 422), ('Акула', 427), ('Горбуша', 445), ('Сібас', 450), ('Сом', 482),
  ('Лосось', 520), ('Мурена', 558), ('Скат', 702), ('Осетр', 825), ('Фугу', 967)
) as v(name, price)
join public.items i on i.name = v.name
where bi.buyer_id = 'fish' and bi.item_id = i.id and bi.price is distinct from v.price;

update public.buyers set fixed_prices = true, sale_limit = 5000, sale_limit_unit = 'кг'
  where id = 'fish' and (not fixed_prices or sale_limit is distinct from 5000);
