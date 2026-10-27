-- Q-Hub: ліміт ШІ-помічника — 50 питань на день на гравця (було 150, 0016_assistant.sql); доба — київська, як у грі.
-- assistant_left() — скільки питань лишилось сьогодні: програма показує це в налаштуваннях плашки («Відповіді ШІ»).
-- Рахує сервер (функція assistant бере запит через assistant_take до виклику Claude), тож обійти ліміт із програми не можна.
-- Файл можна запускати повторно.
create or replace function public.assistant_take() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); used int;
begin
  if uid is null then return false; end if;
  insert into public.assistant_usage as u (user_id, day, n) values (uid, (now() at time zone 'Europe/Kyiv')::date, 1)
    on conflict (user_id, day) do update set n = u.n + 1
    returning n into used;
  return used <= 50;
end $$;
revoke all on function public.assistant_take() from public, anon;
grant execute on function public.assistant_take() to authenticated;

create or replace function public.assistant_left() returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(0, 50 - coalesce((select n from public.assistant_usage
    where user_id = auth.uid() and day = (now() at time zone 'Europe/Kyiv')::date), 0))::int
$$;
revoke all on function public.assistant_left() from public, anon;
grant execute on function public.assistant_left() to authenticated;
