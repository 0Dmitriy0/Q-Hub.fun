-- ШІ-помічник програми (Alt+Q): денний ліміт запитів на гравця, щоб рахунок за API не ріс без меж.
-- Таблицю напряму не видно нікому (RLS без політик) — лічильник змінює лише assistant_take().
create table if not exists public.assistant_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  n int not null,
  primary key (user_id, day)
);
alter table public.assistant_usage enable row level security;

-- бере один запит з денного ліміту (доба — київська, як у грі); false — ліміт вичерпано або гравець не ввійшов
create or replace function public.assistant_take() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); used int;
begin
  if uid is null then return false; end if;
  insert into public.assistant_usage as u (user_id, day, n) values (uid, (now() at time zone 'Europe/Kyiv')::date, 1)
    on conflict (user_id, day) do update set n = u.n + 1
    returning n into used;
  return used <= 150;
end $$;
revoke all on function public.assistant_take() from public, anon;
grant execute on function public.assistant_take() to authenticated;
