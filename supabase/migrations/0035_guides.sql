-- Q-Hub: інструкції на сайті, які адмін пише й оновлює без випуску сайту (specs/023, FR-011).
-- Перша — «Як поставити мапу в гру» (slug game-map). Кроки пише власник, пройшовши їх на своїй грі (FR-007):
-- гравці бачать інструкцію лише опублікованою й з датою перевірки. Файл можна запускати повторно.
create table if not exists public.guides (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  title text not null check (char_length(title) between 1 and 120),
  -- розділи рядками: кроки через порожній рядок; «Знімок: https://…» — картинка до кроку
  install text not null default '' check (char_length(install) <= 20000),
  restore text not null default '' check (char_length(restore) <= 10000),
  faq text not null default '' check (char_length(faq) <= 10000),
  permission_url text not null default '' check (permission_url = '' or permission_url ~ '^https://'),
  discord_url text not null default '' check (discord_url = '' or discord_url ~ '^https://'),
  checked_on date,
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  check (not published or checked_on is not null)   -- без дати перевірки не публікується (FR-007)
);
alter table public.guides enable row level security;
drop policy if exists "guides: read published" on public.guides;
drop policy if exists "guides: admin write" on public.guides;
create policy "guides: read published" on public.guides for select using (published or public.is_admin());
create policy "guides: admin write" on public.guides for all using (public.is_admin()) with check (public.is_admin());

insert into public.guides (slug, title) values ('game-map', 'Як поставити мапу Q-Hub у гру') on conflict (slug) do nothing;
