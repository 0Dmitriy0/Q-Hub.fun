-- Ціна з програми поза межами скупника не проходить для жодної ролі (specs/004 FR-005, FR-007).
-- Раніше межі (−10 % від мінімуму … +10 % від максимуму) перевірялись лише для гравців: якщо програма увійшла під admin
-- чи editor, хибно зчитане число (зайва цифра спереду) йшло на сайт. Ручне внесення staff — як і досі, свідоме (FR-006).
-- Решта функції — без змін з 0008.

create or replace function public.check_buyer_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bi public.buyer_items; staff boolean := public.is_staff(); pr public.profiles;
begin
  if new.kind <> 'buyer' then return new; end if;
  select * into bi from public.buyer_items where buyer_id = new.buyer_id and item_id = new.item_id;
  if not found then raise exception 'У цього скупника немає такого товару.'; end if;
  if new.reporter is not null then
    select * into pr from public.profiles where id = new.reporter;
    if pr.static_id is null or coalesce(btrim(pr.game_name), '') = '' then
      raise exception 'Спершу вкажи нік персонажа і статік у профілі.';
    end if;
  end if;
  if (not staff or new.source = 'desktop') and bi.min_price > 0 and bi.max_price > bi.min_price
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
