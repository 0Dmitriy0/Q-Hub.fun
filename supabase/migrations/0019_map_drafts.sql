-- Q-Hub: чернетки міток з гри (specs/001-map-pin-drafts). Редактор у програмі тисне F9 на великій карті гри —
-- програма надсилає знімок і точку (або «точку не визначено»). Публікує в map_points чи відхиляє лише адмін.
-- editor і moderator лише подають і бачать свої; права на саму мапу не змінюються (конституція, принцип II).
-- Знімки — у закритому бакеті map-drafts: бачать адмін і автор, назовні не віддаються ніколи (принцип III).
-- Файл можна запускати повторно.

create table if not exists public.map_drafts (
  id uuid primary key,                       -- створює програма: повторна відправка не дає дубля (принцип V)
  author uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  taken_at timestamptz not null check (taken_at <= now() + interval '10 minutes'),   -- коли натиснули F9 (час ПК)
  created_at timestamptz not null default now(),
  shot text not null check (length(shot) <= 200),                                     -- шлях у бакеті: <author>/<id>.jpg
  x double precision check (x between -6000 and 6800),
  y double precision check (y between -4400 and 8500),
  match jsonb not null default '{}',         -- службове: масштаб, бали зіставлення, розмір екрана, версія програми
  status text not null default 'new' check (status in ('new', 'published', 'rejected')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  point_id bigint references public.map_points (id) on delete set null,
  shot_deleted_at timestamptz,
  constraint map_drafts_point_pair check ((x is null) = (y is null)),
  constraint map_drafts_reviewed check (status = 'new' or reviewed_at is not null),
  constraint map_drafts_point_published check (point_id is null or status = 'published')
);
create index if not exists map_drafts_queue on public.map_drafts (status, created_at desc);
create index if not exists map_drafts_author on public.map_drafts (author, created_at desc);

alter table public.map_drafts enable row level security;
drop policy if exists "map_drafts: admin or author read" on public.map_drafts;
drop policy if exists "map_drafts: staff insert own" on public.map_drafts;
create policy "map_drafts: admin or author read" on public.map_drafts for select
  using (public.is_admin() or author = auth.uid());
-- подати можна лише нову чернетку від себе; оброблення — тільки через функції нижче (прямих update/delete немає ні в кого)
create policy "map_drafts: staff insert own" on public.map_drafts for insert
  with check (public.is_staff() and author = auth.uid() and status = 'new'
    and reviewed_by is null and reviewed_at is null and point_id is null and shot_deleted_at is null);

-- ---------- знімки ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('map-drafts', 'map-drafts', false, 3145728, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "map-drafts: staff upload own" on storage.objects;
drop policy if exists "map-drafts: admin or author read" on storage.objects;
drop policy if exists "map-drafts: admin delete" on storage.objects;
create policy "map-drafts: staff upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'map-drafts' and public.is_staff() and split_part(name, '/', 1) = auth.uid()::text);
create policy "map-drafts: admin or author read" on storage.objects for select to authenticated
  using (bucket_id = 'map-drafts' and (public.is_admin() or split_part(name, '/', 1) = auth.uid()::text));
create policy "map-drafts: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'map-drafts' and public.is_admin());

-- ---------- оброблення адміном ----------
-- Публікація: в одній транзакції позначає чернетку й створює мітку. Вже оброблену — помилка already_processed,
-- тож дві вкладки чи подвійний клік не створять двох міток.
create or replace function public.publish_map_draft(draft uuid, category text, x double precision, y double precision,
  name text default '', note text default '') returns bigint
language plpgsql security definer set search_path = '' as $$
declare pid bigint;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if coalesce(trim(category), '') = '' then raise exception 'no_category'; end if;
  if x is null or y is null then raise exception 'no_point'; end if;
  update public.map_drafts d set status = 'published', reviewed_by = auth.uid(), reviewed_at = now(),
    x = publish_map_draft.x, y = publish_map_draft.y
    where d.id = draft and d.status = 'new';
  if not found then raise exception 'already_processed'; end if;
  insert into public.map_points (category_id, name, note, x, y)
    values (category, coalesce(publish_map_draft.name, ''), coalesce(publish_map_draft.note, ''), publish_map_draft.x, publish_map_draft.y)
    returning id into pid;
  update public.map_drafts set point_id = pid where id = draft;
  return pid;
end $$;

create or replace function public.reject_map_draft(draft uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.map_drafts set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    where id = draft and status = 'new';
  if not found then raise exception 'already_processed'; end if;
end $$;

-- Знімки оброблених понад 30 днів тому чернеток видаляє сайт під адміном (сховище); тут лише позначка, що їх уже немає.
create or replace function public.mark_map_draft_shots_deleted(drafts uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.map_drafts set shot_deleted_at = now()
    where id = any (drafts) and status <> 'new' and reviewed_at < now() - interval '30 days' and shot_deleted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.publish_map_draft(uuid, text, double precision, double precision, text, text) from public, anon;
revoke all on function public.reject_map_draft(uuid) from public, anon;
revoke all on function public.mark_map_draft_shots_deleted(uuid[]) from public, anon;
grant execute on function public.publish_map_draft(uuid, text, double precision, double precision, text, text) to authenticated;
grant execute on function public.reject_map_draft(uuid) to authenticated;
grant execute on function public.mark_map_draft_shots_deleted(uuid[]) to authenticated;
