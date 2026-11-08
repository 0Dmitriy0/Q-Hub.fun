-- Q-Hub: іконку роботи можна взяти з готових іконок мапи (прохання власника 2026-11-08) — це шляхи сайту /icons/…,
-- а не https-адреси, тож перевірку jobs.icon з 0062 розширюємо. Файл можна запускати повторно.
alter table public.jobs drop constraint if exists jobs_icon_url;
alter table public.jobs add constraint jobs_icon_url
  check (icon = '' or icon ~ '^https://[^\s"''<>]+$' or icon ~ '^/icons/[a-z0-9_/-]+\.(svg|png|webp)$');
