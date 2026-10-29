-- Q-Hub: плитки головної про сам сайт (specs/011) — гравців у Q-Hub, міток на мапі, завантажень програми.
-- «Зараз у програмі» — окремо, app_online() (0023). Гість бачить лише загальні числа: таблиці напряму не читає ніхто.
-- Завантаження — кліки «Завантажити для Windows» на сторінці «Програма», від випуску цієї міграції
-- (GitHub не зберігає лічильник: збірка щоразу перезаливає інсталятор у реліз desktop-latest). Файл можна запускати повторно.
create table if not exists public.site_counters (
  key text primary key check (key ~ '^[a-z_]{1,40}$'),
  n bigint not null default 0 check (n >= 0),
  since timestamptz not null default now()
);
alter table public.site_counters enable row level security;   -- політик немає: прямий доступ закритий
insert into public.site_counters (key) values ('downloads') on conflict (key) do nothing;

create or replace function public.count_download() returns void
language sql volatile security definer set search_path = public as $$
  update public.site_counters set n = n + 1 where key = 'downloads'
$$;

-- адміни, редактори й модератори (службові акаунти) не роздувають лічильник гравців
create or replace function public.site_stats() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'players', (select count(*) from public.profiles where role = 'user'),
    'pins', (select count(*) from public.map_points),
    'downloads', (select n from public.site_counters where key = 'downloads')
  )
$$;

revoke all on function public.count_download() from public;
grant execute on function public.count_download() to anon, authenticated;
revoke all on function public.site_stats() from public;
grant execute on function public.site_stats() to anon, authenticated;
