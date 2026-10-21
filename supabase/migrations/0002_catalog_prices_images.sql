-- Q-Hub: ціни від редакторів і картинки каталогу.
-- Поки гравців мало, правило «3 підтвердження» майже не спрацьовує, тож у кожного товару скупника є ціна,
-- яку вписує редактор (адмін). Підтверджена ціна гравців (prices_confirmed) показується, коли вона є.

alter table public.buyer_items
  add column if not exists price bigint not null default 0 check (price >= 0),
  add column if not exists price_at timestamptz,
  add column if not exists price_by uuid references public.profiles (id) on delete set null;

alter table public.buyers add column if not exists image_url text not null default '';
alter table public.items add column if not exists image_url text not null default '';

-- хто і коли змінив ціну — ставить сама база, не клієнт; заодно оновлюється час скупника
create or replace function public.stamp_buyer_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.price is distinct from old.price then
    -- імпорт може передати власний час (ціни з хабу); звичайна правка з сайту отримує «зараз»
    if new.price_at is not distinct from old.price_at then new.price_at := now(); end if;
    new.price_by := auth.uid();
    update public.buyers set updated_at = now() where id = new.buyer_id;
  end if;
  return new;
end $$;

drop trigger if exists buyer_items_price_stamp on public.buyer_items;
create trigger buyer_items_price_stamp before update on public.buyer_items
  for each row execute function public.stamp_buyer_price();

-- ---------- картинки: публічне сховище, завантажують лише редактори ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog', 'catalog', true, 1048576, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "catalog: staff upload" on storage.objects;
drop policy if exists "catalog: staff update" on storage.objects;
drop policy if exists "catalog: staff delete" on storage.objects;
create policy "catalog: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and public.is_staff());
create policy "catalog: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and public.is_staff()) with check (bucket_id = 'catalog' and public.is_staff());
create policy "catalog: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and public.is_staff());
