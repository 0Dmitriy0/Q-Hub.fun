-- Q-Hub: зони на мапі (specs/002-map-areas) — багатокутники, напр. поля скарбів уздовж пляжів.
-- Бачать усі, малює й видаляє лише адмін (як мітки, 0015). Координати — метри гри, як у map_points.
-- Файл можна запускати повторно.

create table if not exists public.map_areas (
  id bigint generated always as identity primary key,
  category_id text not null references public.map_categories (id) on delete cascade on update cascade,
  name text not null default '' check (length(name) <= 160),
  note text not null default '' check (length(note) <= 600),
  ring jsonb not null,   -- [[x, y], …] — вершини контуру по порядку, без повтору першої
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists map_areas_category on public.map_areas (category_id);

-- контур: масив 3–500 пар чисел у межах мапи. CASE — бо в AND/OR Postgres не гарантує порядок,
-- і «"a"»::float8 чи довжина не-масиву впали б іншою помилкою замість «контур неправильний»
create or replace function public.map_ring_ok(r jsonb) returns boolean
language sql immutable as $$
  select case
    when jsonb_typeof(r) <> 'array' then false
    when jsonb_array_length(r) not between 3 and 500 then false
    else not exists (
      select 1 from jsonb_array_elements(r) p
      where case
        when jsonb_typeof(p) <> 'array' then true
        when jsonb_array_length(p) <> 2 then true
        when jsonb_typeof(p -> 0) <> 'number' or jsonb_typeof(p -> 1) <> 'number' then true
        else (p ->> 0)::float8 not between -6000 and 6800 or (p ->> 1)::float8 not between -4400 and 8500
      end)
  end
$$;
alter table public.map_areas drop constraint if exists map_areas_ring_ok;
alter table public.map_areas add constraint map_areas_ring_ok check (public.map_ring_ok(ring));

alter table public.map_areas enable row level security;
drop policy if exists "map_areas: read all" on public.map_areas;
drop policy if exists "map_areas: admin write" on public.map_areas;
create policy "map_areas: read all" on public.map_areas for select using (true);
create policy "map_areas: admin write" on public.map_areas for all using (public.is_admin()) with check (public.is_admin());

-- категорія для полів скарбів; за замовчуванням вимкнена у фільтрах
insert into public.map_categories (id, name, grp, icon, color, sort, shown) values
  ('treasure-fields', 'Поля скарбів', 'Заробіток', '/icons/jobs/treasure.svg', '#e0b84a', 54, false)
on conflict (id) do nothing;
