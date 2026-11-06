-- Q-Hub: джерела міток без назв чужих проєктів (specs/017). Коди джерела: 'partner' — мітки, отримані від
-- партнерів за їхньою згодою; 'import' — разовий імпорт; 'game' — зібрані в грі.
-- Підпис джерела, видимий гравцю (specs/012 FR-009a), — тепер у самій мітці: map_points.credit (назва) і
-- credit_url (посилання); сайт показує його в картці мітки. Заповнює адмін у Supabase → SQL Editor.
-- Залежить від 0033. Файл можна запускати повторно.
alter table public.map_batches drop constraint if exists map_batches_source_check;
alter table public.map_points drop constraint if exists map_points_source_check;
-- старі коди: партії «Гарбузів» — від партнерів, решта нестандартних — імпорт
update public.map_batches set source = case when category_id = 'harbuzy' then 'partner' else 'import' end where source not in ('partner', 'import', 'game');
update public.map_points set source = case when category_id = 'harbuzy' then 'partner' else 'import' end where source is not null and source not in ('partner', 'import', 'game');
alter table public.map_batches add constraint map_batches_source_check check (source in ('partner', 'import', 'game'));
alter table public.map_points add constraint map_points_source_check check (source is null or source in ('partner', 'import', 'game'));

alter table public.map_points add column if not exists credit text check (credit is null or char_length(credit) between 1 and 80);
alter table public.map_points add column if not exists credit_url text check (credit_url is null or (char_length(credit_url) <= 300 and credit_url ~ '^https://[^\s"<>]+$'));
