-- Q-Hub: написи на мапі від адміна (specs/089) — замість готових назв місць з експорту Hydra (прибрано повністю).
-- Текст, місце, колір, шрифт (Google Fonts через Fontsource), обводка, кут і розмір у метрах гри.
-- Читають усі, пишуть лише admin (конституція, принцип II). Файл можна запускати повторно.
create table if not exists public.map_labels (
  id bigint generated always as identity primary key,
  text text not null check (length(btrim(text)) between 1 and 40 and text !~ '[\r\n]'),
  x double precision not null check (x between -6000 and 6800),
  y double precision not null check (y between -4400 and 8500),
  color text not null default '#f4f1ec' check (color ~ '^#[0-9a-f]{6}$'),
  font text not null default 'roboto-condensed' check (font ~ '^[a-z0-9-]{2,40}$'),
  weight int not null default 700 check (weight between 100 and 900 and weight % 100 = 0),
  outline_color text not null default '#0d0d0d' check (outline_color ~ '^#[0-9a-f]{6}$'),
  outline_w real not null default 3 check (outline_w between 0 and 20),
  angle real not null default 0 check (angle between -180 and 180),
  size real not null default 30 check (size between 5 and 400),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.map_labels_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists map_labels_touch on public.map_labels;
create trigger map_labels_touch before update on public.map_labels for each row execute function public.map_labels_touch();

alter table public.map_labels enable row level security;
drop policy if exists "map_labels: read all" on public.map_labels;
drop policy if exists "map_labels: admin write" on public.map_labels;
create policy "map_labels: read all" on public.map_labels for select using (true);
create policy "map_labels: admin write" on public.map_labels for all using (public.is_admin()) with check (public.is_admin());
grant select on public.map_labels to anon, authenticated;
grant insert, update, delete on public.map_labels to authenticated;
