-- Q-Hub: фото мітки мапи (specs/055, прохання власника 2026-11-04 — «сфоткати привидів для розуміння»).
-- Фото видно в спливаючому вікні мітки на мапі сайту, у програмі й на сторінці івенту. Змінює мітки, як і раніше, лише
-- admin (політика «map_points: admin write», 0015); файл — у публічному бакеті catalog, тека map/ (вантажить admin, 0006).
-- Фото — обрізаний кадр з гри без чату, ніків і HUD (конституція III: сирі знімки гравців сюди не потрапляють).
-- Файл можна запускати повторно.
alter table public.map_points add column if not exists photo_url text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'map_points_photo_url') then
    alter table public.map_points add constraint map_points_photo_url check (photo_url = '' or photo_url ~ '^https://[^\s"''<>]+$');
  end if;
end $$;
