-- Q-Hub: історія цін скупників — з неї графік і спостережений мінімум/максимум.
-- Кожну зміну ціни (вписану редактором або імпортовану з хабу) записує сама база.
-- Писати в історію напряму не може ніхто, крім тригера; читають усі.

create table if not exists public.price_history (
  id bigint generated always as identity primary key,
  buyer_id text not null references public.buyers on delete cascade,
  item_id bigint not null references public.items on delete cascade,
  price bigint not null check (price > 0),
  at timestamptz not null default now(),
  unique (buyer_id, item_id, at, price)
);
create index if not exists price_history_item_at on public.price_history (buyer_id, item_id, at desc);

alter table public.price_history enable row level security;
drop policy if exists "price history: read all" on public.price_history;
create policy "price history: read all" on public.price_history for select using (true);

create or replace function public.log_buyer_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.price > 0 and (tg_op = 'INSERT' or new.price is distinct from old.price) then
    insert into public.price_history (buyer_id, item_id, price, at)
    values (new.buyer_id, new.item_id, new.price, coalesce(new.price_at, now()))
    on conflict do nothing;
  end if;
  return null;
end $$;

drop trigger if exists buyer_items_price_log on public.buyer_items;
create trigger buyer_items_price_log after insert or update of price on public.buyer_items
  for each row execute function public.log_buyer_price();

-- ціни, що вже є в каталозі, стають першими точками історії
insert into public.price_history (buyer_id, item_id, price, at)
select buyer_id, item_id, price, price_at from public.buyer_items where price > 0 and price_at is not null
on conflict do nothing;
