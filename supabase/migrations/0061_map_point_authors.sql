-- Q-Hub 0061: автор мітки на мапі й оголошення нових міток у Discord.
-- 1) map_point_authors — хто запропонував мітку: автор чернетки Alt+F9 (map_drafts.point_id) або пропозиції в довідник
--    (wiki_versions, перша версія мітки). Лише нік у Q-Hub — ім'я з Discord не показується; без ніку — автора не видно.
--    Видно лише опубліковані й не сховані мітки (як у політиці map_points, 0060).
-- 2) discord_bot: канал «Мітки від гравців» — бот раз на кілька хвилин пише, хто що додав.
--    marks_after — id останньої оголошеної мітки: старі мітки при увімкненні не оголошуються (адмінка ставить поточний max).
-- Залежить від 0019, 0055, 0059, 0060. Файл можна запускати повторно.

create index if not exists map_drafts_point on public.map_drafts (point_id) where point_id is not null;

create or replace view public.map_point_authors with (security_barrier) as
select p.id as point_id, btrim(pr.nick) as name
from public.map_points p
cross join lateral (select coalesce(
  (select d.author from public.map_drafts d where d.point_id = p.id and d.status = 'published' limit 1),
  (select v.author from public.wiki_versions v
     where v.section = 'map_point' and v.target_id = p.id::text and v.version_no = 1 and v.author is not null limit 1)
) as author) a
join public.profiles pr on pr.id = a.author
where nullif(btrim(pr.nick), '') is not null
  and not p.hidden
  and (p.batch_id is null or public.map_batch_published(p.batch_id));
grant select on public.map_point_authors to anon, authenticated;

alter table public.discord_bot add column if not exists marks_on boolean not null default false;
alter table public.discord_bot add column if not exists marks_channel_id text not null default ''
  check (marks_channel_id = '' or marks_channel_id ~ '^[0-9]{17,20}$');
alter table public.discord_bot add column if not exists marks_after bigint not null default 0 check (marks_after >= 0);
