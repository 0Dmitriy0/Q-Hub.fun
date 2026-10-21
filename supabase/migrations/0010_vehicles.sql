-- Q-Hub: каталог транспорту (авто, мото, авіа) з держ. ціною й характеристиками
-- і оцінки гравців (1–5 зірок, одна оцінка від гравця на транспорт, можна змінити).
create table if not exists public.vehicles (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('auto', 'moto', 'avia')),
  name text not null unique,
  brand text not null default '',
  salon text not null default '',
  price bigint not null default 0 check (price >= 0),
  speed integer, trunk integer, tank integer, seats integer,
  image_url text not null default '',
  extra jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.vehicle_ratings (
  vehicle_id bigint not null references public.vehicles on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (vehicle_id, user_id)
);

alter table public.vehicles enable row level security;
alter table public.vehicle_ratings enable row level security;
drop policy if exists "vehicles: read all" on public.vehicles;
drop policy if exists "vehicles: staff write" on public.vehicles;
create policy "vehicles: read all" on public.vehicles for select using (true);
create policy "vehicles: staff write" on public.vehicles for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "ratings: own" on public.vehicle_ratings;
create policy "ratings: own" on public.vehicle_ratings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- середня оцінка для всіх (окремі оцінки бачить лише їх автор)
create or replace view public.vehicle_scores as
select vehicle_id, round(avg(stars)::numeric, 2) as avg, count(*) as votes
from public.vehicle_ratings group by vehicle_id;
grant select on public.vehicle_scores to anon, authenticated;
