-- Q-Hub: поточну ціну скупника оновлюють самі гравці, а рейтинг показує, хто вносить ціни.
-- Скупник-NPC міняє ціни кожні 3 години (цикл). Кожен гравець може внести ціну товару раз за цикл
-- (повторне внесення в тому ж циклі — виправлення, воно замінює попереднє). Внесена ціна одразу стає
-- поточною. Захист від помилок і жартівників: ціна має бути в межах скупника (мін −10% … макс +10%),
-- не більше 120 внесень на годину, і кожна зміна підписана іменем у таблиці «Останні оновлення».

-- ---------- цикл цін: початок поточного 3-годинного вікна за київським часом (00:00, 03:00, 06:00…) ----------
create or replace function public.price_cycle_start(ts timestamptz default now()) returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('hour', ts at time zone 'Europe/Kyiv')
          - make_interval(hours => extract(hour from ts at time zone 'Europe/Kyiv')::int % 3)) at time zone 'Europe/Kyiv'
$$;

-- ---------- хто змінив ціну — в історії теж ----------
alter table public.price_history add column if not exists by uuid references public.profiles (id) on delete set null;

create or replace function public.log_buyer_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.price > 0 and (tg_op = 'INSERT' or new.price is distinct from old.price) then
    insert into public.price_history (buyer_id, item_id, price, at, by)
    values (new.buyer_id, new.item_id, new.price, coalesce(new.price_at, now()), new.price_by)
    on conflict do nothing;
  end if;
  return null;
end $$;

-- ---------- внесення ціни гравцем ----------
alter table public.price_reports add column if not exists cycle timestamptz;
create unique index if not exists price_reports_one_per_cycle
  on public.price_reports (reporter, buyer_id, item_id, cycle) where kind = 'buyer';

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

create or replace function public.apply_buyer_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'buyer' then
    update public.buyer_items set price = new.price, price_at = new.created_at, price_by = new.reporter
      where buyer_id = new.buyer_id and item_id = new.item_id;
  end if;
  return null;
end $$;

drop trigger if exists price_reports_check on public.price_reports;
create trigger price_reports_check before insert on public.price_reports
  for each row execute function public.check_buyer_report();
drop trigger if exists price_reports_apply on public.price_reports;
create trigger price_reports_apply after insert on public.price_reports
  for each row execute function public.apply_buyer_report();

-- ціну, внесену гравцем, автор не підміняє: stamp_buyer_price ставить автора лише для правок напряму
create or replace function public.stamp_buyer_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.price is distinct from old.price or new.price_at is distinct from old.price_at then
    if new.price_at is not distinct from old.price_at then new.price_at := now(); end if;
    if new.price_by is not distinct from old.price_by then new.price_by := auth.uid(); end if;
    update public.buyers set updated_at = greatest(coalesce(updated_at, new.price_at), new.price_at) where id = new.buyer_id;
  end if;
  return new;
end $$;

-- ---------- публічні зведення: лише ім'я з Discord, жодних інших даних профілю ----------
-- (view працює з правами власника, тож обходить «свій профіль» лише в цих стовпцях)
create or replace view public.price_updates as
select r.id, r.buyer_id, r.item_id, r.price, r.created_at, r.cycle, p.name as reporter_name
from public.price_reports r join public.profiles p on p.id = r.reporter
where r.kind = 'buyer';

create or replace view public.contributors as
select p.id, p.name, p.avatar_url,
       count(*) filter (where r.created_at > now() - interval '7 days') as week,
       count(*) as total,
       max(r.created_at) as last_at
from public.price_reports r join public.profiles p on p.id = r.reporter
where r.kind = 'buyer'
group by p.id, p.name, p.avatar_url;

grant select on public.price_updates, public.contributors to anon, authenticated;
