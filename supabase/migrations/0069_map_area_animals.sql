-- Q-Hub: звірі на полях полювання (specs/088). Зона мапи отримує список видів, що там з'являються.
-- Читають усі, пишуть лише admin — політики map_areas з 0021 покривають і цю колонку.
-- Файл можна запускати повторно.
alter table public.map_areas add column if not exists animals text[] not null default '{}';

-- лише 8 відомих видів і без повторів (порядок — rabbit, cow, pig, coyote, deer, puma, panther, boar, як у src/lib/huntAnimals.ts)
create or replace function public.map_animals_ok(a text[]) returns boolean
language sql immutable as $$
  select a is not null
    and a <@ array['rabbit','cow','pig','coyote','deer','puma','panther','boar']::text[]
    and cardinality(a) = (select count(distinct x) from unnest(a) x)
$$;
alter table public.map_areas drop constraint if exists map_areas_animals_ok;
alter table public.map_areas add constraint map_areas_animals_ok check (public.map_animals_ok(animals));
