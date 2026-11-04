-- Справжня ціна за старими межами все одно потрапляє на сайт (specs/035 US1, відповідь власника Q1 = Б, 2026-11-04).
-- • price_reports.out_of_limits — голос програми за ціну поза межами скупника: програма впевнено прочитала її 3 рази
--   за одне відкриття вікна (pricescan.cjs, ODD_SURE/ODD_TIMES). Межа ±10 % для такого голосу не діє, але лише
--   в «правдоподібному» коридорі 0,5 × мінімуму … 1,5 × максимуму. Далі — зайва чи пропущена цифра (FR-004), не голос.
-- • Поточною така ціна стає за тим самим правилом N різних акаунтів (0043, apply_buyer_report без змін).
-- • Межі не змінюються самі (варіант Б, FR-006): admin бачить «перевір межі» з кількістю акаунтів і розширює їх сам.
-- Залежить від 0030 (buyer_limit_reports), 0038 (check_buyer_report з персонажем), 0043 (голоси). Файл можна запускати повторно.

alter table public.price_reports add column if not exists out_of_limits boolean not null default false;

-- як у 0038; змінено лише перевірку меж: голос out_of_limits — з програми й у правдоподібному коридорі
create or replace function public.check_buyer_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bi public.buyer_items; staff boolean := public.is_staff(); pr public.profiles; ch public.characters; n int;
  lim boolean;
begin
  if new.kind <> 'buyer' then return new; end if;
  select * into bi from public.buyer_items where buyer_id = new.buyer_id and item_id = new.item_id;
  if not found then raise exception 'У цього скупника немає такого товару.'; end if;
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

-- «перевір межі»: скільки різних акаунтів бачили ціну поза межами (FR-005). Ніки не зберігаються — лише id для ліку
alter table public.buyer_limit_reports add column if not exists reporters uuid[] not null default '{}';
update public.buyer_limit_reports set reporters = array[reported_by] where reporters = '{}' and reported_by is not null;

create or replace function public.report_limit_mismatch(p_buyer text, p_item bigint, p_price bigint) returns void
language plpgsql security definer set search_path = public as $$
declare bi public.buyer_items;
begin
  if auth.uid() is null then raise exception 'потрібен вхід' using errcode = '42501'; end if;
  select * into bi from public.buyer_items where buyer_id = p_buyer and item_id = p_item;
  if not found then raise exception 'немає такого товару в скупника' using errcode = '22023'; end if;
  if coalesce(p_price, 0) <= 0 or not (bi.min_price > 0 and bi.max_price > bi.min_price)
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
