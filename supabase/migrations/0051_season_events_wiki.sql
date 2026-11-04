-- Q-Hub: івенти у WIKI (specs/055). Сезонний івент з блоку «Найближчі івенти» (0025, 0034) отримує адресу сторінки
-- /wiki/iventy/<slug>, тип (звичайний / батл пас), фото, повний опис і «минулого разу». Нові таблиці: прив'язка івенту
-- до категорій мапи (мітки не вносяться вдруге) і рівні батл пасу. Читають усі, змінюють staff (is_staff: editor,
-- moderator, admin) — як season_events з 0025. Фото — бакет catalog, тека events/, вантажить staff.
-- Щоденні івенти за розкладом (src/lib/events.ts) сюди не належать. Файл можна запускати повторно.

alter table public.season_events add column if not exists slug text;
alter table public.season_events add column if not exists kind text not null default 'event';
alter table public.season_events add column if not exists image_url text not null default '';
alter table public.season_events add column if not exists body text not null default '';
alter table public.season_events add column if not exists prev_id bigint references public.season_events (id) on delete set null;

-- наявні івенти (Хелловін) одразу мають адресу; staff може змінити її у формі
update public.season_events set slug = 'event-' || id where slug is null;

-- без адреси (старий сайт у кеші браузера під час деплою) — адреса з id, а не помилка вставки
create or replace function public.season_events_slug() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.slug is null or new.slug = '' then new.slug := 'event-' || new.id; end if;
  return new;
end $$;
drop trigger if exists season_events_slug on public.season_events;
create trigger season_events_slug before insert or update of slug on public.season_events
  for each row execute function public.season_events_slug();

alter table public.season_events alter column slug set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'season_events_slug_key') then
    alter table public.season_events add constraint season_events_slug_key unique (slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'season_events_slug_fmt') then
    alter table public.season_events add constraint season_events_slug_fmt check (slug ~ '^[a-z0-9-]{2,60}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'season_events_kind') then
    alter table public.season_events add constraint season_events_kind check (kind in ('event', 'battlepass'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'season_events_image') then
    alter table public.season_events add constraint season_events_image check (image_url = '' or image_url ~ '^https://');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'season_events_body') then
    alter table public.season_events add constraint season_events_body check (char_length(body) <= 20000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'season_events_prev') then
    alter table public.season_events add constraint season_events_prev check (prev_id is null or prev_id <> id);
  end if;
end $$;

create table if not exists public.season_event_maps (
  event_id bigint not null references public.season_events (id) on delete cascade,
  category_id text not null references public.map_categories (id) on delete cascade on update cascade,
  primary key (event_id, category_id)
);
create table if not exists public.season_event_levels (
  event_id bigint not null references public.season_events (id) on delete cascade,
  level integer not null check (level between 1 and 500),
  line text not null default 'free' check (line in ('free', 'paid')),
  reward text not null check (char_length(reward) between 1 and 200),
  primary key (event_id, level, line)
);

alter table public.season_event_maps enable row level security;
alter table public.season_event_levels enable row level security;
drop policy if exists "season_event_maps: read all" on public.season_event_maps;
drop policy if exists "season_event_maps: staff write" on public.season_event_maps;
drop policy if exists "season_event_levels: read all" on public.season_event_levels;
drop policy if exists "season_event_levels: staff write" on public.season_event_levels;
create policy "season_event_maps: read all" on public.season_event_maps for select using (true);
create policy "season_event_maps: staff write" on public.season_event_maps for all using (public.is_staff()) with check (public.is_staff());
create policy "season_event_levels: read all" on public.season_event_levels for select using (true);
create policy "season_event_levels: staff write" on public.season_event_levels for all using (public.is_staff()) with check (public.is_staff());
grant select on public.season_event_maps, public.season_event_levels to anon, authenticated;
grant insert, update, delete on public.season_event_maps, public.season_event_levels to authenticated;

-- фото івентів: staff вантажить лише в catalog/events/; решта бакета — як було (лише admin, 0006).
-- read потрібен для заміни файлу (upsert), як у 0006
drop policy if exists "catalog: staff events read" on storage.objects;
drop policy if exists "catalog: staff events upload" on storage.objects;
drop policy if exists "catalog: staff events update" on storage.objects;
drop policy if exists "catalog: staff events delete" on storage.objects;
create policy "catalog: staff events read" on storage.objects for select to authenticated
  using (bucket_id = 'catalog' and name like 'events/%' and public.is_staff());
create policy "catalog: staff events upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and name like 'events/%' and public.is_staff());
create policy "catalog: staff events update" on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and name like 'events/%' and public.is_staff())
  with check (bucket_id = 'catalog' and name like 'events/%' and public.is_staff());
create policy "catalog: staff events delete" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and name like 'events/%' and public.is_staff());
