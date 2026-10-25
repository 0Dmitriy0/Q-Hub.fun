-- Q-Hub: «онлайн програми» — скільки гравців зараз із запущеним Q-Hub Desktop (лічильник у шапці сайту).
-- Програма раз на хвилину кличе app_ping(); сайт кличе app_online() — кількість за останні 3 хвилини.
-- Таблицю напряму не читає й не пише ніхто: лише ці дві функції, і ping оновлює тільки рядок того, хто кличе.
-- Файл можна запускати повторно.
create table if not exists public.app_presence (
  user_id uuid primary key references auth.users on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.app_presence enable row level security;   -- політик немає: прямий доступ закритий

create or replace function public.app_ping() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'потрібен вхід' using errcode = '42501'; end if;
  insert into public.app_presence (user_id, seen_at) values (auth.uid(), now())
    on conflict (user_id) do update set seen_at = excluded.seen_at;
end $$;

create or replace function public.app_online() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.app_presence where seen_at > now() - interval '3 minutes'
$$;

revoke all on function public.app_ping() from public, anon;
grant execute on function public.app_ping() to authenticated;
revoke all on function public.app_online() from public;
grant execute on function public.app_online() to anon, authenticated;
