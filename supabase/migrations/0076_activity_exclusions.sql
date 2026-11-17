-- Q-Hub 0076: виключення з конкурсу активності (specs/091, US3).
-- Адмін виключає окремий внесок (event_id) або гравця на проміжок днів за Києвом (user_id + period_from..period_to),
-- обов'язково з причиною. Скасування не видаляє запис, а ставить revoked_* — історію видно іншим адмінам (FR-017).
-- Виключення діє лише на конкурсний підрахунок: сам внесок (ціна, мітка, гайд) лишається на сайті (FR-018).
-- activity_top перевизначається з урахуванням виключень; activity_user_events — внески гравця з причиною незарахування.
-- Залежить від 0075. Файл можна запускати повторно.

create table if not exists public.activity_exclusions (
  id bigint generated always as identity primary key,
  event_id bigint references public.activity_events (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  period_from date,
  period_to date,
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  constraint activity_exclusions_one_target check ((event_id is null) <> (user_id is null)),
  constraint activity_exclusions_period check (
    (user_id is null and period_from is null and period_to is null)
    or (user_id is not null and period_from is not null and period_to is not null and period_from <= period_to))
);
create unique index if not exists activity_exclusions_event_active on public.activity_exclusions (event_id) where revoked_at is null and event_id is not null;
create unique index if not exists activity_exclusions_user_active on public.activity_exclusions (user_id, period_from, period_to) where revoked_at is null and user_id is not null;
create index if not exists activity_exclusions_user on public.activity_exclusions (user_id) where user_id is not null;

alter table public.activity_exclusions enable row level security;
drop policy if exists "activity_exclusions: admin read" on public.activity_exclusions;
create policy "activity_exclusions: admin read" on public.activity_exclusions for select using (public.is_admin());

-- ---------- внесок виключено? (вручну за внеском або гравця на день внеску) ----------
create or replace function public.activity_excluded(p_event bigint, p_user uuid, p_at timestamptz) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.activity_exclusions x where x.event_id = p_event and x.revoked_at is null) then 'excluded'
    when exists (select 1 from public.activity_exclusions x where x.user_id = p_user and x.revoked_at is null
                 and (p_at at time zone 'Europe/Kyiv')::date between x.period_from and x.period_to) then 'player_excluded'
  end
$$;
revoke all on function public.activity_excluded(bigint, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.activity_require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'лише для адміна' using errcode = '42501'; end if;
end $$;
revoke all on function public.activity_require_admin() from public, anon;
grant execute on function public.activity_require_admin() to authenticated;

-- ---------- топ з урахуванням виключень ----------
create or replace function public.activity_top(p_from date, p_to date, p_limit int default 10)
returns table (category text, place int, user_id uuid, nick text, cnt int, reached_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare lim int; roles text[];
begin
  perform public.activity_require_admin();
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365 then
    raise exception 'поганий період' using errcode = '22023';
  end if;
  select s.price_daily_limit, s.excluded_roles into lim, roles from public.activity_settings s where s.id;
  lim := coalesce(lim, 1); roles := coalesce(roles, '{admin,moderator}');
  return query
  with ev as (
    select e.id, e.user_id, e.category, e.created_at, e.group_key
    from public.activity_events e
    join public.profiles pr on pr.id = e.user_id
    where e.status = 'counted'
      and e.created_at >= (p_from::timestamp at time zone 'Europe/Kyiv')
      and e.created_at < ((p_to + 1)::timestamp at time zone 'Europe/Kyiv')
      and not (pr.role = any (roles))
      and public.activity_excluded(e.id, e.user_id, e.created_at) is null
  ), numbered as (
    select ev.*, row_number() over (
      partition by ev.user_id, ev.group_key, (ev.created_at at time zone 'Europe/Kyiv')::date
      order by ev.created_at, ev.id) as rn
    from ev
  ), agg as (
    select n.category, n.user_id, count(*)::int as cnt, max(n.created_at) as reached_at
    from numbered n
    where n.category <> 'prices' or n.rn <= lim
    group by n.category, n.user_id
  ), ranked as (
    select a.category, a.user_id, a.cnt, a.reached_at,
      (row_number() over (partition by a.category order by a.cnt desc, a.reached_at asc, a.user_id))::int as place
    from agg a
  )
  select r.category, r.place, r.user_id, nullif(btrim(pr.nick), ''), r.cnt, r.reached_at
  from ranked r
  join public.profiles pr on pr.id = r.user_id
  where r.place <= greatest(1, least(coalesce(p_limit, 10), 100))
  order by r.category, r.place;
end $$;
revoke all on function public.activity_top(date, date, int) from public, anon;
grant execute on function public.activity_top(date, date, int) to authenticated;

-- ---------- внески гравця за період з причиною незарахування ----------
-- reason: over_daily_limit | excluded | player_excluded | role_excluded | pending | rejected | removed | null (зараховано)
-- (drop: create or replace не вміє змінити колонки результату, якщо їх доповнять)
drop function if exists public.activity_user_events(uuid, date, date, text);
create or replace function public.activity_user_events(p_user uuid, p_from date, p_to date, p_category text default null)
returns table (event_id bigint, category text, entity_id text, title text, link text, created_at timestamptz, status text,
               counted boolean, reason text, exclusion_id bigint, exclusion_reason text, excluded_by text, excluded_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare lim int; roles text[]; urole text;
begin
  perform public.activity_require_admin();
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365 then
    raise exception 'поганий період' using errcode = '22023';
  end if;
  select s.price_daily_limit, s.excluded_roles into lim, roles from public.activity_settings s where s.id;
  lim := coalesce(lim, 1); roles := coalesce(roles, '{admin,moderator}');
  select pr.role into urole from public.profiles pr where pr.id = p_user;
  return query
  with ev as (
    select e.*, public.activity_excluded(e.id, e.user_id, e.created_at) as excl
    from public.activity_events e
    where e.user_id = p_user
      and (p_category is null or e.category = p_category)
      and e.created_at >= (p_from::timestamp at time zone 'Europe/Kyiv')
      and e.created_at < ((p_to + 1)::timestamp at time zone 'Europe/Kyiv')
  ), numbered as (
    select ev.*, case when ev.status = 'counted' and ev.excl is null then row_number() over (
      partition by ev.group_key, (ev.created_at at time zone 'Europe/Kyiv')::date, (ev.status = 'counted' and ev.excl is null)
      order by ev.created_at, ev.id) end as rn
    from ev
  ), reasoned as (
    select n.*,
      case
        when n.status <> 'counted' then n.status
        when n.excl is not null then n.excl
        when urole = any (roles) then 'role_excluded'
        when n.category = 'prices' and n.rn > lim then 'over_daily_limit'
      end as why
    from numbered n
  )
  select r.id, r.category, r.entity_id,
    case r.category
      when 'prices' then (select coalesce(i.name, '?') || ' — ' || coalesce(b.name, '?')
                          from public.price_reports pr2
                          left join public.items i on i.id = pr2.item_id
                          left join public.buyers b on b.id = pr2.buyer_id
                          where pr2.id::text = r.source_id)
      when 'marks' then (select coalesce(nullif(btrim(m.name), ''), 'Мітка #' || m.id) from public.map_points m
                         where r.entity_id ~ '^[0-9]+$' and m.id = r.entity_id::bigint)
      when 'guides' then (select g.name from public.wiki_guides g where g.id = r.entity_id)
    end,
    -- посилання на сайт: мапа відкривається на координатах мітки, гайд — своєю сторінкою, ціни — сторінкою скупників
    case r.category
      when 'prices' then '/tsiny'
      when 'marks' then (select '/mapa#' || round(m.x) || ',' || round(m.y) || ',7' from public.map_points m
                         where r.entity_id ~ '^[0-9]+$' and m.id = r.entity_id::bigint)
      when 'guides' then case when r.entity_id is not null then '/wiki/gaidy/' || r.entity_id end
    end,
    r.created_at, r.status, r.why is null, r.why,
    x.id, x.reason, nullif(btrim(xp.nick), ''), x.created_at
  from reasoned r
  left join public.activity_exclusions x on x.event_id = r.id and x.revoked_at is null
  left join public.profiles xp on xp.id = x.created_by
  order by r.created_at desc;
end $$;
revoke all on function public.activity_user_events(uuid, date, date, text) from public, anon;
grant execute on function public.activity_user_events(uuid, date, date, text) to authenticated;

-- ---------- виключити / повернути ----------
create or replace function public.activity_exclude_event(p_event bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare xid bigint;
begin
  perform public.activity_require_admin();
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'причина — від 3 до 300 символів' using errcode = '22023';
  end if;
  if not exists (select 1 from public.activity_events where id = p_event) then
    raise exception 'внесок не знайдено' using errcode = 'P0002';
  end if;
  select id into xid from public.activity_exclusions where event_id = p_event and revoked_at is null;
  if xid is not null then return xid; end if;
  insert into public.activity_exclusions (event_id, reason, created_by) values (p_event, btrim(p_reason), auth.uid())
    returning id into xid;
  return xid;
end $$;

create or replace function public.activity_exclude_user(p_user uuid, p_from date, p_to date, p_reason text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare xid bigint;
begin
  perform public.activity_require_admin();
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'причина — від 3 до 300 символів' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'поганий період' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'гравця не знайдено' using errcode = 'P0002';
  end if;
  select id into xid from public.activity_exclusions
    where user_id = p_user and period_from = p_from and period_to = p_to and revoked_at is null;
  if xid is not null then return xid; end if;
  insert into public.activity_exclusions (user_id, period_from, period_to, reason, created_by)
    values (p_user, p_from, p_to, btrim(p_reason), auth.uid()) returning id into xid;
  return xid;
end $$;

create or replace function public.activity_unexclude(p_exclusion bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.activity_require_admin();
  update public.activity_exclusions set revoked_by = auth.uid(), revoked_at = now()
    where id = p_exclusion and revoked_at is null;
  if not found then raise exception 'виключення не знайдено' using errcode = 'P0002'; end if;
end $$;

-- історія виключень, що перетинають період (і активних, і скасованих)
create or replace function public.activity_exclusions_list(p_from date, p_to date)
returns table (id bigint, event_id bigint, user_id uuid, user_nick text, period_from date, period_to date, reason text,
               created_by_nick text, created_at timestamptz, revoked_by_nick text, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.activity_require_admin();
  return query
  select x.id, x.event_id, coalesce(x.user_id, e.user_id), nullif(btrim(u.nick), ''), x.period_from, x.period_to, x.reason,
    nullif(btrim(c.nick), ''), x.created_at, nullif(btrim(rv.nick), ''), x.revoked_at
  from public.activity_exclusions x
  left join public.activity_events e on e.id = x.event_id
  left join public.profiles u on u.id = coalesce(x.user_id, e.user_id)
  left join public.profiles c on c.id = x.created_by
  left join public.profiles rv on rv.id = x.revoked_by
  where (x.user_id is not null and x.period_from <= p_to and x.period_to >= p_from)
     or (x.event_id is not null and e.created_at >= (p_from::timestamp at time zone 'Europe/Kyiv')
         and e.created_at < ((p_to + 1)::timestamp at time zone 'Europe/Kyiv'))
  order by x.created_at desc;
end $$;

revoke all on function public.activity_exclude_event(bigint, text) from public, anon;
revoke all on function public.activity_exclude_user(uuid, date, date, text) from public, anon;
revoke all on function public.activity_unexclude(bigint) from public, anon;
revoke all on function public.activity_exclusions_list(date, date) from public, anon;
grant execute on function public.activity_exclude_event(bigint, text) to authenticated;
grant execute on function public.activity_exclude_user(uuid, date, date, text) to authenticated;
grant execute on function public.activity_unexclude(bigint) to authenticated;
grant execute on function public.activity_exclusions_list(date, date) to authenticated;
