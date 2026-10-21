-- Q-Hub: картинки скупників і товарів вантажить і змінює лише адмін (власник сайту).
-- Заодно виправлено завантаження: заміна файлу (upsert) у Supabase Storage потребує ще й права
-- читати рядки storage.objects — без нього кожне завантаження падало на правилах доступу.

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.my_role() = 'admin' $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog', 'catalog', true, 1048576, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "catalog: staff upload" on storage.objects;
drop policy if exists "catalog: staff update" on storage.objects;
drop policy if exists "catalog: staff delete" on storage.objects;
drop policy if exists "catalog: admin read" on storage.objects;
drop policy if exists "catalog: admin upload" on storage.objects;
drop policy if exists "catalog: admin update" on storage.objects;
drop policy if exists "catalog: admin delete" on storage.objects;
create policy "catalog: admin read" on storage.objects for select to authenticated
  using (bucket_id = 'catalog' and public.is_admin());
create policy "catalog: admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and public.is_admin());
create policy "catalog: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and public.is_admin()) with check (bucket_id = 'catalog' and public.is_admin());
create policy "catalog: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and public.is_admin());

-- редактори можуть правити каталог, але адресу картинки змінює лише адмін
create or replace function public.guard_image_url() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.image_url is distinct from old.image_url and auth.uid() is not null and not public.is_admin() then
    raise exception 'Картинки змінює лише адмін.';
  end if;
  return new;
end $$;
drop trigger if exists buyers_image_guard on public.buyers;
create trigger buyers_image_guard before update of image_url on public.buyers for each row execute function public.guard_image_url();
drop trigger if exists items_image_guard on public.items;
create trigger items_image_guard before update of image_url on public.items for each row execute function public.guard_image_url();
