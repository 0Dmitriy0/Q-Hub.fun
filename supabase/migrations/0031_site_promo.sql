-- Q-Hub: власний промокод Q-Hub на QuantRP (specs/022) — окремий блок на першому екрані головної, без дат.
-- Один рядок. Бачать усі (вимкнений сайт просто не показує); змінює, вмикає й вимикає лише admin. Файл можна запускати повторно.
create table if not exists public.site_promo (
  id boolean primary key default true check (id),   -- рядок завжди один
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,40}$'),
  reward text not null check (char_length(reward) between 1 and 200),
  note text not null default '' check (char_length(note) <= 300),   -- умова (години гри тощо); порожньо — без умови
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.site_promo enable row level security;
drop policy if exists "site_promo: read all" on public.site_promo;
drop policy if exists "site_promo: admin write" on public.site_promo;
create policy "site_promo: read all" on public.site_promo for select using (true);
create policy "site_promo: admin write" on public.site_promo for all using (public.is_admin()) with check (public.is_admin());

insert into public.site_promo (code, reward) values ('QHUB', 'Отримайте 50.000$ та +1 рівень.') on conflict (id) do nothing;
