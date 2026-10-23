-- Навчальні знімки з програми (Alt+S → «Поділитися з розробниками Q-Hub»): з них «зір» вчиться впізнавати меню гри.
-- Сховище закрите: гравець кладе файли лише у свою теку (<його id>/…), бачить і видаляє їх тільки адмін.
-- На знімку буває чат і ніки інших гравців, тож назовні вони не віддаються ніколи.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('training', 'training', false, 3145728, array['image/jpeg', 'application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "training: own upload" on storage.objects;
drop policy if exists "training: admin read" on storage.objects;
drop policy if exists "training: admin delete" on storage.objects;
create policy "training: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'training' and split_part(name, '/', 1) = auth.uid()::text);
create policy "training: admin read" on storage.objects for select to authenticated
  using (bucket_id = 'training' and public.is_admin());
create policy "training: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'training' and public.is_admin());
