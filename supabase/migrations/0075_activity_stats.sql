-- Q-Hub 0075: статистика активності для щомісячних конкурсів (specs/091).
-- 1) activity_events — єдина таблиця подій (user, category, entity_id, created_at, status), з неї й лише з неї рахується статистика.
--    Пишуть її тригери на таблицях-джерелах (price_reports, map_drafts, wiki_proposals, map_points, map_batches, wiki_guides),
--    тож будь-який шлях зміни (RPC, адмінка, SQL вручну) її оновлює. Правила статусу — в одній функції activity_event_state:
--    нею користуються й тригери, й activity_sync_all (перенесення наявних даних і звірка з джерелами в тестах).
-- 2) status — лише життєвий цикл джерела (pending / counted / rejected / removed). Ліміт цін за добу, ролі без участі й виключення
--    адміна застосовуються в запиті activity_top під час перегляду — тож зміна налаштувань діє одразу й на весь період.
-- 3) activity_settings — ліміт зарахувань ціни за добу й ролі, що не беруть участі (за замовчуванням admin і moderator).
-- 4) activity_top — топ за період; лише admin (42501 для решти).
-- Категорії: prices (внесення ціни скупника), marks (нова мітка: чернетка Alt+F9 або пропозиція в довідник), guides (новий гайд).
-- Поля на карті й правки не рахуються (specs/091 FR-010, FR-011). Залежить від 0004, 0019, 0033, 0057, 0059, 0060, 0065.
-- Файл можна запускати повторно.

-- ---------- події ----------
create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('prices', 'marks', 'guides')),
  entity_id text,
  created_at timestamptz not null,
  status text not null check (status in ('pending', 'counted', 'rejected', 'removed')),
  source text not null check (source in ('price_reports', 'map_drafts', 'wiki_proposals')),
  source_id text not null,
  group_key text,
  updated_at timestamptz not null default now(),
  constraint activity_events_source_uniq unique (source, source_id)
);
create index if not exists activity_events_cat_at on public.activity_events (category, created_at);
create index if not exists activity_events_user on public.activity_events (user_id, category, created_at);
create index if not exists activity_events_entity on public.activity_events (category, entity_id);

alter table public.activity_events enable row level security;
drop policy if exists "activity_events: admin read" on public.activity_events;
create policy "activity_events: admin read" on public.activity_events for select using (public.is_admin());

-- ---------- видимість опублікованого об'єкта ----------
create or replace function public.activity_point_visible(p bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select not m.hidden and (m.batch_id is null or public.map_batch_published(m.batch_id))
                   from public.map_points m where m.id = p), false)
$$;

-- ---------- єдине місце правил: який стан має подія для рядка джерела ----------
-- Нуль рядків — подія не потрібна (не той kind/section або джерела вже немає).
create or replace function public.activity_event_state(p_source text, p_source_id text)
returns table (user_id uuid, category text, entity_id text, created_at timestamptz, status text, group_key text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_source = 'price_reports' then
    return query
      select r.reporter, 'prices'::text, r.id::text, r.created_at, 'counted'::text, r.buyer_id || '|' || r.item_id::text
      from public.price_reports r
      where r.id = p_source_id::bigint and r.kind = 'buyer' and r.buyer_id is not null;
  elsif p_source = 'map_drafts' then
    return query
      select d.author, 'marks'::text, d.point_id::text, d.created_at,
        case d.status when 'new' then 'pending' when 'rejected' then 'rejected'
          else case when public.activity_point_visible(d.point_id) then 'counted' else 'removed' end end,
        null::text
      from public.map_drafts d
      where d.id = p_source_id::uuid;
  elsif p_source = 'wiki_proposals' then
    -- одна мітка — один автор: якщо мітку має опублікована чернетка, вона в пріоритеті (як у map_point_authors, 0061)
    return query
      select p.author, case p.section when 'map_point' then 'marks' else 'guides' end, v.target_id, p.created_at,
        case
          when p.status = 'pending' then 'pending'
          when p.status in ('accepted', 'accepted_edited') then
            case
              when p.section = 'guide' then
                case when exists (select 1 from public.wiki_guides g where g.id = v.target_id and not g.hidden)
                  then 'counted' else 'removed' end
              when v.target_id ~ '^[0-9]+$'
                and public.activity_point_visible(v.target_id::bigint)
                and not exists (select 1 from public.map_drafts d where d.point_id = v.target_id::bigint and d.status = 'published')
                then 'counted'
              else 'removed'
            end
          else 'rejected'
        end,
        null::text
      from public.wiki_proposals p
      left join public.wiki_versions v on v.id = p.version_id
      where p.id = p_source_id::uuid and p.kind = 'new' and p.section in ('map_point', 'guide');
  end if;
end $$;

-- ---------- оновити одну подію за рядком джерела; повертає 1, якщо подія змінилась ----------
create or replace function public.activity_upsert(p_source text, p_source_id text) returns int
language plpgsql security definer set search_path = '' as $$
declare s record; n int := 0;
begin
  select * into s from public.activity_event_state(p_source, p_source_id) limit 1;
  if found then
    insert into public.activity_events as e (user_id, category, entity_id, created_at, status, source, source_id, group_key)
    values (s.user_id, s.category, s.entity_id, s.created_at, s.status, p_source, p_source_id, s.group_key)
    on conflict (source, source_id) do update
      set user_id = excluded.user_id, category = excluded.category, entity_id = excluded.entity_id,
          created_at = excluded.created_at, status = excluded.status, group_key = excluded.group_key, updated_at = now()
      where (e.user_id, e.category, e.entity_id, e.created_at, e.status, e.group_key)
        is distinct from (excluded.user_id, excluded.category, excluded.entity_id, excluded.created_at, excluded.status, excluded.group_key);
    get diagnostics n = row_count;
  else
    update public.activity_events set status = 'removed', updated_at = now()
      where source = p_source and source_id = p_source_id and status <> 'removed';
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

-- ---------- тригери на джерелах ----------
-- TG_ARGV[0] — назва джерела; id рядка — поле id (bigint або uuid). Фільтр kind/section — в activity_event_state
-- (WHEN з old/new у тригері на insert+delete Postgres не дозволяє)
create or replace function public.activity_track() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.activity_upsert(tg_argv[0], old.id::text);
  else
    perform public.activity_upsert(tg_argv[0], new.id::text);
  end if;
  return null;
end $$;

drop trigger if exists activity_track on public.price_reports;
create trigger activity_track after insert or update or delete on public.price_reports
  for each row execute function public.activity_track('price_reports');
drop trigger if exists activity_track on public.map_drafts;
create trigger activity_track after insert or update of status, point_id, author or delete on public.map_drafts
  for each row execute function public.activity_track('map_drafts');
drop trigger if exists activity_track on public.wiki_proposals;
create trigger activity_track after insert or update of status, version_id or delete on public.wiki_proposals
  for each row execute function public.activity_track('wiki_proposals');

-- зміна опублікованого об'єкта — перерахувати події, що на нього посилаються
create or replace function public.activity_track_entity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ev record; cat text := tg_argv[0]; ids text[];
begin
  if tg_table_name = 'map_batches' then
    select array_agg(m.id::text) into ids from public.map_points m where m.batch_id = new.id;
  elsif tg_op = 'DELETE' then
    ids := array[old.id::text];
  else
    ids := array[new.id::text];
  end if;
  for ev in select e.source, e.source_id from public.activity_events e where e.category = cat and e.entity_id = any(coalesce(ids, '{}')) loop
    perform public.activity_upsert(ev.source, ev.source_id);
  end loop;
  -- пропозиція мітки втрачає пріоритет, коли мітку має чернетка (і навпаки) — їх теж перерахувати
  if cat = 'marks' then
    for ev in select e.source, e.source_id from public.activity_events e
              join public.wiki_proposals p on e.source = 'wiki_proposals' and p.id::text = e.source_id
              join public.wiki_versions v on v.id = p.version_id
              where v.target_id = any(coalesce(ids, '{}')) loop
      perform public.activity_upsert(ev.source, ev.source_id);
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists activity_track_entity on public.map_points;
create trigger activity_track_entity after update of hidden, batch_id or delete on public.map_points
  for each row execute function public.activity_track_entity('marks');
drop trigger if exists activity_track_entity on public.map_batches;
create trigger activity_track_entity after update of published on public.map_batches
  for each row execute function public.activity_track_entity('marks');
drop trigger if exists activity_track_entity on public.wiki_guides;
create trigger activity_track_entity after update of hidden or delete on public.wiki_guides
  for each row execute function public.activity_track_entity('guides');

-- чернетка, опублікована на мітку з пропозиції, забирає пріоритет у пропозиції
create or replace function public.activity_track_draft_point() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ev record; pts text[];
begin
  if tg_op = 'INSERT' then
    pts := array[new.point_id::text];
  elsif tg_op = 'DELETE' then
    pts := array[old.point_id::text];
  else
    pts := array[old.point_id::text, new.point_id::text];
  end if;
  for ev in select e.source, e.source_id from public.activity_events e
            join public.wiki_proposals p on e.source = 'wiki_proposals' and p.id::text = e.source_id
            join public.wiki_versions v on v.id = p.version_id
            where v.target_id = any(pts) loop
    perform public.activity_upsert(ev.source, ev.source_id);
  end loop;
  return null;
end $$;
drop trigger if exists activity_track_draft_point on public.map_drafts;
create trigger activity_track_draft_point after insert or update of status, point_id or delete on public.map_drafts
  for each row execute function public.activity_track_draft_point();

-- ---------- повна звірка з джерелами: перенесення наявних даних і перевірка в тестах ----------
-- Повертає кількість подій, які довелося змінити. 0 — таблиця подій точно відповідає джерелам.
create or replace function public.activity_sync_all() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in
    select 'price_reports'::text as s, id::text as i from public.price_reports where kind = 'buyer'
    union all select 'map_drafts', id::text from public.map_drafts
    union all select 'wiki_proposals', id::text from public.wiki_proposals where kind = 'new' and section in ('map_point', 'guide')
    union all select source, source_id from public.activity_events
  loop
    n := n + public.activity_upsert(r.s, r.i);
  end loop;
  return n;
end $$;

revoke all on function public.activity_point_visible(bigint) from public, anon, authenticated;
revoke all on function public.activity_event_state(text, text) from public, anon, authenticated;
revoke all on function public.activity_upsert(text, text) from public, anon, authenticated;
revoke all on function public.activity_track() from public, anon, authenticated;
revoke all on function public.activity_track_entity() from public, anon, authenticated;
revoke all on function public.activity_track_draft_point() from public, anon, authenticated;
revoke all on function public.activity_sync_all() from public, anon, authenticated;

-- ---------- налаштування ----------
create table if not exists public.activity_settings (
  id boolean primary key default true check (id),
  price_daily_limit int not null default 1 check (price_daily_limit between 1 and 50),
  excluded_roles text[] not null default '{admin,moderator}'
    check (excluded_roles <@ array['user', 'editor', 'moderator', 'admin']::text[]),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.activity_settings (id) values (true) on conflict do nothing;
alter table public.activity_settings enable row level security;
drop policy if exists "activity_settings: admin read" on public.activity_settings;
create policy "activity_settings: admin read" on public.activity_settings for select using (public.is_admin());

-- ---------- топ за період (лише admin) ----------
-- Дати — дні за Києвом, включно. Порядок: більше внесків; за рівності — хто раніше досяг цієї кількості.
create or replace function public.activity_top(p_from date, p_to date, p_limit int default 10)
returns table (category text, place int, user_id uuid, nick text, cnt int, reached_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare lim int; roles text[];
begin
  if not public.is_admin() then raise exception 'лише для адміна' using errcode = '42501'; end if;
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

-- ---------- перенесення наявних даних ----------
select public.activity_sync_all();
