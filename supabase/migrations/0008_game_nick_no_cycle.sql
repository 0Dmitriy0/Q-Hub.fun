-- Q-Hub: хто змінив ціну — нік персонажа і статік; ціни скупники міняють у різний час, без 3-годинного циклу.
-- • profiles.game_name — нік персонажа в грі; разом зі статіком обов'язковий і видимий у «Останніх оновленнях» і рейтингу.
-- • Замість «раз за цикл»: повторне внесення того ж товару впродовж 10 хв — виправлення (замінює попереднє);
--   ту саму ціну, що вже стоїть і оновлена менше ніж 30 хв тому, база не приймає — бал за неї не нараховується.

alter table public.profiles add column if not exists game_name text
  check (game_name is null or char_length(btrim(game_name)) between 3 and 32);
grant update (game_name) on public.profiles to authenticated;

drop index if exists public.price_reports_one_per_cycle;

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
  if not staff and bi.min_price > 0 and bi.max_price > bi.min_price
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

-- нік персонажа і статік — у публічних зведеннях (нові стовпці в кінці, старі запити працюють)
create or replace view public.price_updates as
select r.id, r.buyer_id, r.item_id, r.price, r.created_at, r.cycle, p.name as reporter_name,
       p.game_name as reporter_game, p.static_id as reporter_static
from public.price_reports r join public.profiles p on p.id = r.reporter
where r.kind = 'buyer';

create or replace view public.contributors as
select p.id, p.name, p.avatar_url,
       count(*) filter (where r.created_at > now() - interval '7 days') as week,
       count(*) as total,
       max(r.created_at) as last_at,
       count(*) filter (where r.created_at > now() - interval '1 month') as month,
       count(*) filter (where r.created_at > now() - interval '1 year') as year,
       p.game_name, p.static_id
from public.price_reports r join public.profiles p on p.id = r.reporter
where r.kind = 'buyer'
group by p.id, p.name, p.avatar_url, p.game_name, p.static_id;

grant select on public.price_updates, public.contributors to anon, authenticated;
