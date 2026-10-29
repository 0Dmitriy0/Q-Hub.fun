-- Q-Hub: «перевір межі» — ціни поза межами скупника, які програма впевнено прочитала тричі за відкриття вікна
-- (specs/024, T031; жива гра 2026-10-29: «Молоток» 64 при межах 76–498). На сайт така ціна не йде — лише підказка адміну.
-- Гравець пише лише через report_limit_mismatch(); бачить і прибирає рядки тільки admin. Файл можна запускати повторно.
create table if not exists public.buyer_limit_reports (
  buyer_id text not null,
  item_id bigint not null,
  price bigint not null check (price > 0),
  seen_count integer not null default 1 check (seen_count >= 1),
  last_seen timestamptz not null default now(),
  reported_by uuid references auth.users on delete set null default auth.uid(),
  primary key (buyer_id, item_id),
  foreign key (buyer_id, item_id) references public.buyer_items (buyer_id, item_id) on delete cascade on update cascade
);

alter table public.buyer_limit_reports enable row level security;
drop policy if exists "buyer_limit_reports: admin read" on public.buyer_limit_reports;
drop policy if exists "buyer_limit_reports: admin delete" on public.buyer_limit_reports;
create policy "buyer_limit_reports: admin read" on public.buyer_limit_reports for select using (public.is_admin());
create policy "buyer_limit_reports: admin delete" on public.buyer_limit_reports for delete using (public.is_admin());

/* один рядок на товар: остання прочитана ціна й скільки разів повідомляли. Ціна в межах (або меж немає) — не підказка */
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
  insert into public.buyer_limit_reports (buyer_id, item_id, price, reported_by) values (p_buyer, p_item, p_price, auth.uid())
    on conflict (buyer_id, item_id) do update set price = excluded.price, seen_count = buyer_limit_reports.seen_count + 1,
      last_seen = now(), reported_by = excluded.reported_by;
end $$;

revoke all on function public.report_limit_mismatch(text, bigint, bigint) from public, anon;
grant execute on function public.report_limit_mismatch(text, bigint, bigint) to authenticated;
