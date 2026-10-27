-- Q-Hub: сезонні івенти (напр. «Найттаун: Хелловін») і промокоди сервера — вкладки в блоці «Найближчі івенти» на головній.
-- Бачать усі, додають і змінюють адмін і редактори (is_staff). Файл можна запускати повторно.
create table if not exists public.season_events (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 600),
  starts_on date not null,
  ends_on date not null,
  link text not null default '' check (link = '' or link ~ '^https://'),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create table if not exists public.promo_codes (
  id bigint generated always as identity primary key,
  code text not null check (char_length(code) between 1 and 40),
  reward text not null check (char_length(reward) between 1 and 200),
  -- скільки годин треба відіграти, щоб код спрацював; null — без умови
  playtime_hours numeric(6, 1) check (playtime_hours is null or playtime_hours >= 0),
  starts_on date not null,
  ends_on date not null,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

alter table public.season_events enable row level security;
alter table public.promo_codes enable row level security;
drop policy if exists "season_events: read all" on public.season_events;
drop policy if exists "season_events: staff write" on public.season_events;
drop policy if exists "promo_codes: read all" on public.promo_codes;
drop policy if exists "promo_codes: staff write" on public.promo_codes;
create policy "season_events: read all" on public.season_events for select using (true);
create policy "season_events: staff write" on public.season_events for all using (public.is_staff()) with check (public.is_staff());
create policy "promo_codes: read all" on public.promo_codes for select using (true);
create policy "promo_codes: staff write" on public.promo_codes for all using (public.is_staff()) with check (public.is_staff());
