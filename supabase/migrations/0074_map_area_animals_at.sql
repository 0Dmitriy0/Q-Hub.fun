-- Q-Hub: місце звірів у полі полювання. Адмін сам ставить точку, навколо якої стоять іконки звірів
-- (на мапі сайту — плашка, на мапі для гри — сітка значків), щоб вони не закривали написи.
-- null — місце підбирається само (середина поля). Читають усі, пишуть лише admin — політики map_areas з 0021.
-- Файл можна запускати повторно.
alter table public.map_areas add column if not exists animals_at jsonb;

alter table public.map_areas drop constraint if exists map_areas_animals_at_ok;
alter table public.map_areas add constraint map_areas_animals_at_ok check (
  animals_at is null or (
    jsonb_typeof(animals_at) = 'array' and jsonb_array_length(animals_at) = 2
    and jsonb_typeof(animals_at -> 0) = 'number' and jsonb_typeof(animals_at -> 1) = 'number'
  )
);
