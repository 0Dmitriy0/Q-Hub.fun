-- Q-Hub: статік (ігровий ID) у профілі — обов'язковий.
-- Без статіка сайт не пускає далі вікна «Вкажи свій статік», а база не приймає оновлення цін.
-- Статік унікальний: двоє гравців не можуть вказати один і той самий. Видно його лише власнику й редакторам.

alter table public.profiles add column if not exists static_id integer unique
  check (static_id between 1 and 999999999);
grant update (static_id) on public.profiles to authenticated;

create or replace function public.check_buyer_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bi public.buyer_items; staff boolean := public.is_staff();
begin
  if new.kind <> 'buyer' then return new; end if;
  select * into bi from public.buyer_items where buyer_id = new.buyer_id and item_id = new.item_id;
  if not found then raise exception 'У цього скупника немає такого товару.'; end if;
  if not staff and bi.min_price > 0 and bi.max_price > bi.min_price
     and (new.price < bi.min_price * 0.9 or new.price > bi.max_price * 1.1) then
    raise exception 'Ціна % $ поза межами скупника (% – % $). Перевір число.', new.price, bi.min_price, bi.max_price;
  end if;
  if new.reporter is not null and (select static_id from public.profiles where id = new.reporter) is null then
    raise exception 'Спершу вкажи свій статік у профілі.';
  end if;
  if not staff and (select count(*) from public.price_reports
                    where reporter = new.reporter and created_at > now() - interval '1 hour') >= 120 then
    raise exception 'Забагато внесень за годину. Спробуй трохи пізніше.';
  end if;
  new.created_at := now();
  new.cycle := public.price_cycle_start(new.created_at);
  -- виправлення в тому ж циклі замінює попереднє внесення цього гравця
  delete from public.price_reports
    where kind = 'buyer' and reporter = new.reporter and buyer_id = new.buyer_id and item_id = new.item_id and cycle = new.cycle;
  return new;
end $$;
