-- Q-Hub: «Поля полювання» — шар мапи зонами, як «Поля скарбів» (0021, 0022). Самі зони — supabase/seed/map_hunting_fields.sql.
-- Файл можна запускати повторно.
insert into public.map_categories (id, name, grp, icon, color, sort, shown) values
  ('hunting-fields', 'Поля полювання', 'Шари мапи', '/icons/jobs/hunter.svg', '#d9622b', 4, false)
on conflict (id) do nothing;
