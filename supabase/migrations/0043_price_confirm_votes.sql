-- Ціна скупника стає поточною, коли ту саму ціну дали N різних акаунтів (конституція 1.1.0, принцип IV; specs/029).
-- • price_rules — N і вікно голосів; змінює лише admin, діє з наступного внесення (без релізу).
-- • Внесення гравця — голос: рахуються голоси за ту саму ціну, новіші за поточну ціну й не старші за вікно;
--   персонажі одного акаунта — один голос (виправлення за 10 хв і так замінює своє внесення, 0036).
-- • Ручне внесення staff (не з програми) — одразу поточне, як і досі (specs/004 FR-006); staff з програми — звичайний голос.
-- • Та сама ціна, що вже стоїть (і старша за 30 хв, інакше «вже актуальна»), — одразу оновлює час: ціна не змінюється.
-- • price_reports.confirmed — голос, що поставив ціну (або був серед тих, що її поставили); старі внесення — уже поставлені.
-- • price_pending — непідтверджені варіанти для позначки «нова: X $ · k з N» на сайті й у програмі.
-- check_buyer_report не змінюється: «Ця ціна вже актуальна» й так дивиться лише на поточну (підтверджену) ціну.

create table if not exists public.price_rules (
  id boolean primary key default true check (id),
  confirm_n int not null default 2 check (confirm_n between 1 and 10),
  confirm_window interval not null default interval '3 hours' check (confirm_window between interval '10 minutes' and interval '48 hours')
);
insert into public.price_rules (id) values (true) on conflict do nothing;
alter table public.price_rules enable row level security;
drop policy if exists "правила цін читають усі" on public.price_rules;
create policy "правила цін читають усі" on public.price_rules for select using (true);
drop policy if exists "правила цін змінює адмін" on public.price_rules;
create policy "правила цін змінює адмін" on public.price_rules for update using (public.is_admin()) with check (public.is_admin());
grant select on public.price_rules to anon, authenticated;
grant update (confirm_n, confirm_window) on public.price_rules to authenticated;

alter table public.price_reports add column if not exists confirmed boolean not null default false;
-- до 0043 кожне прийняте внесення одразу ставало поточним
update public.price_reports set confirmed = true where kind = 'buyer' and not confirmed;

create or replace function public.apply_buyer_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bi public.buyer_items; n int; win interval; votes int;
begin
  if new.kind <> 'buyer' then return null; end if;
  select * into bi from public.buyer_items where buyer_id = new.buyer_id and item_id = new.item_id;
  select coalesce(max(confirm_n), 2), coalesce(max(confirm_window), interval '3 hours') into n, win from public.price_rules;
  /* ціна та сама, що вже стоїть (підтверджена раніше), — лише свіжіший час; staff вручну — одразу */
  if new.price = bi.price or (public.is_staff() and new.source <> 'desktop') then
    votes := n;
  else
    select count(distinct r.reporter) into votes from public.price_reports r
      where r.kind = 'buyer' and r.buyer_id = new.buyer_id and r.item_id = new.item_id and r.price = new.price
        and not r.confirmed and r.created_at > now() - win and (bi.price_at is null or r.created_at > bi.price_at);
  end if;
  if votes >= n then
    update public.buyer_items set price = new.price, price_at = new.created_at, price_by = new.reporter
      where buyer_id = new.buyer_id and item_id = new.item_id;
    /* підтверджені всі голоси за цю ціну у вікні — і ті, що поставили її, і ті, що збіглися з ручним внесенням staff */
    update public.price_reports set confirmed = true
      where kind = 'buyer' and buyer_id = new.buyer_id and item_id = new.item_id and price = new.price
        and not confirmed and created_at > now() - win;
  end if;
  return null;
end $$;

-- непідтверджені варіанти: новіші за поточну ціну, у вікні, інші за поточну. Лише агрегати, без авторів (як price_updates)
create or replace view public.price_pending as
select r.buyer_id, r.item_id, r.price, count(distinct r.reporter)::int as votes, pr.confirm_n as need, max(r.created_at) as last_at
from public.price_reports r
join public.buyer_items bi on bi.buyer_id = r.buyer_id and bi.item_id = r.item_id
cross join public.price_rules pr
where r.kind = 'buyer' and not r.confirmed and r.created_at > now() - pr.confirm_window
  and (bi.price_at is null or r.created_at > bi.price_at) and r.price is distinct from bi.price
group by r.buyer_id, r.item_id, r.price, pr.confirm_n;
grant select on public.price_pending to anon, authenticated;

-- «Останні оновлення»: чи внесення поставило ціну (новий стовпець — у кінці, тож create or replace підходить)
create or replace view public.price_updates as
select r.id, r.buyer_id, r.item_id, r.price, r.created_at, r.cycle,
       r.reporter as reporter_id, coalesce(nullif(btrim(p.nick), ''), p.name) as reporter_name, c.name as reporter_character,
       r.confirmed
from public.price_reports r
join public.profiles p on p.id = r.reporter
left join public.characters c on c.id = r.character_id
where r.kind = 'buyer';

-- старе зведення «3 гравці за 48 год» (0001) скупників більше не стосується — лише ринок (sell/buy/sold/rent), якого ще немає
create or replace view public.prices_confirmed as
with recent as (
  select item_id, buyer_id, kind, reporter, price, created_at
  from public.price_reports
  where created_at > now() - interval '48 hours' and kind <> 'buyer'
), med as (
  select item_id, buyer_id, kind, percentile_cont(0.5) within group (order by price) as raw_med
  from recent group by item_id, buyer_id, kind
), clean as (
  select r.* from recent r
  join med m on m.item_id = r.item_id and m.kind = r.kind and m.buyer_id is not distinct from r.buyer_id
  where r.price between m.raw_med * 0.5 and m.raw_med * 2
)
select item_id, buyer_id, kind,
       round(percentile_cont(0.5) within group (order by price))::bigint as price,
       count(distinct reporter) as reporters,
       max(created_at) as updated_at
from clean
group by item_id, buyer_id, kind
having count(distinct reporter) >= 3;
