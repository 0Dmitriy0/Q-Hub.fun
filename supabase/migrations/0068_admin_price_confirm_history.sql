-- Q-Hub: адмін підтверджує кілька непідтверджених цін одразу і прибирає хибні точки з історії цін скупника.
-- • admin_price_confirm — поставити непідтверджену ціну поточною від імені адміна (без персонажа й без внесення):
--   голоси за неї стають confirmed, ціна й час — у buyer_items (історію й Discord пише наявний тригер, 0003/0055).
-- • admin_price_history_delete — видалити точку історії (напр. помилковий сплеск 560 $ на графіку).
--   Поточну (останню) точку не видаляє: її змінюють через «Оновити ціну», інакше графік розійдеться з ціною.
-- Залежить від 0043 і 0046. Файл можна запускати повторно.

create or replace function public.admin_price_confirm(p_buyer text, p_item bigint, p_price bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare bi public.buyer_items; win interval;
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  select * into bi from public.buyer_items where buyer_id = p_buyer and item_id = p_item for update;
  if not found then raise exception 'Такого товару в скупника немає' using errcode = 'P0002'; end if;
  select coalesce(max(confirm_window), interval '3 hours') into win from public.price_rules;
  update public.price_reports r set confirmed = true
    where r.kind = 'buyer' and r.buyer_id = p_buyer and r.item_id = p_item and r.price = p_price
      and not r.confirmed and r.created_at > now() - win and (bi.price_at is null or r.created_at > bi.price_at)
      and p_price is distinct from bi.price;
  if not found then raise exception 'Цей рядок уже розібрано' using errcode = 'P0002'; end if;
  update public.buyer_items set price = p_price, price_at = now(), price_by = auth.uid()
    where buyer_id = p_buyer and item_id = p_item;
end $$;
revoke all on function public.admin_price_confirm(text, bigint, bigint) from public, anon;
grant execute on function public.admin_price_confirm(text, bigint, bigint) to authenticated;

create or replace function public.admin_price_history_delete(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.price_history;
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  select * into h from public.price_history where id = p_id;
  if not found then raise exception 'Цю точку вже видалено' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.price_history x
                 where x.buyer_id = h.buyer_id and x.item_id = h.item_id and (x.at > h.at or (x.at = h.at and x.id > h.id))) then
    raise exception 'Це поточна ціна — зміни її через «Оновити ціну»' using errcode = 'P0001';
  end if;
  delete from public.price_history where id = p_id;
end $$;
revoke all on function public.admin_price_history_delete(bigint) from public, anon;
grant execute on function public.admin_price_history_delete(bigint) to authenticated;
