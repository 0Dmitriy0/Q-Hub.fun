-- Q-Hub: адмін-панель для розробників (specs/039) — усе, що панель читає й змінює понад наявні політики admin.
-- • Черги від програми: невідомі товари (0029), ціни поза межами (0030), непідтверджені ціни (0043), чернетки міток (0019).
-- • Гравці й ролі: пошук акаунта й зміна ролі (клієнтам роль змінювати напряму й далі не можна — 0001).
-- • Стан програми: версія програми в app_presence (програма передає її в app_ping), зведення для панелі.
-- • Навчальні знімки: список файлів сховища training (0018) з ніком автора.
-- Кожна функція admin_* перевіряє is_admin() першим рядком; права — лише authenticated, тіло вирішує саме.
-- Залежить від 0043 (price_rules, price_reports.confirmed). Файл можна запускати повторно.

-- ---------- черги ----------

create or replace function public.admin_queue_counts() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  return json_build_object(
    'unknown', (select count(*) from public.buyer_unknown_items),
    'limits', (select count(*) from public.buyer_limit_reports),
    'pending', (select count(*) from (
      select 1 from public.price_reports r
      join public.buyer_items bi on bi.buyer_id = r.buyer_id and bi.item_id = r.item_id
      cross join public.price_rules pr
      where r.kind = 'buyer' and not r.confirmed and r.created_at > now() - pr.confirm_window
        and (bi.price_at is null or r.created_at > bi.price_at) and r.price is distinct from bi.price
      group by r.buyer_id, r.item_id, r.price) p),
    'drafts', (select count(*) from public.map_drafts where status = 'new'));
end $$;

-- невідома назва: add — товар (новий або наявний) до скупника; alias — назва як псевдонім наявного товару; drop — відкинути.
-- Рядок черги видаляється першим: другий адмін з тим самим рядком отримає «уже розібрано», дубля не буде
create or replace function public.admin_unknown_resolve(p_id bigint, p_action text, p_item bigint default null,
  p_name text default null, p_category text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare u record; nm text; it bigint;
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  if p_action not in ('add', 'alias', 'drop') then raise exception 'невідома дія' using errcode = '22023'; end if;
  delete from public.buyer_unknown_items where id = p_id returning buyer_id, text into u;
  if not found then raise exception 'Цей рядок уже розібрано' using errcode = 'P0002'; end if;

  if p_action = 'add' then
    if p_item is not null then
      if not exists (select 1 from public.items where id = p_item) then raise exception 'Немає такого товару' using errcode = '22023'; end if;
      it := p_item;
    else
      nm := btrim(coalesce(p_name, ''));
      if char_length(nm) not between 2 and 80 then raise exception 'Назва товару — 2–80 символів' using errcode = '22023'; end if;
      if not exists (select 1 from public.categories where key = p_category) then raise exception 'Обери категорію товару' using errcode = '22023'; end if;
      select id into it from public.items where lower(name) = lower(nm);
      if found then raise exception 'Такий товар уже є: % — обери його замість нового', nm using errcode = '22023'; end if;
      insert into public.items (name, category) values (nm, p_category) returning id into it;
    end if;
    insert into public.buyer_items (buyer_id, item_id) values (u.buyer_id, it) on conflict do nothing;

  elsif p_action = 'alias' then
    if p_item is null or not exists (select 1 from public.items where id = p_item) then
      raise exception 'Обери товар, яким є ця назва' using errcode = '22023';
    end if;
    nm := btrim(u.text);
    if char_length(nm) not between 4 and 80 then raise exception 'Псевдонім — 4–80 символів' using errcode = '22023'; end if;
    update public.items set aliases = array_append(aliases, nm)
    where id = p_item and lower(name) <> lower(nm)
      and not exists (select 1 from unnest(aliases) a where lower(a) = lower(nm));
  end if;
end $$;

-- ціна поза межами: fix — нові межі товару в скупника; drop — відкинути
create or replace function public.admin_limit_resolve(p_buyer text, p_item bigint, p_action text,
  p_min bigint default null, p_max bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  if p_action not in ('fix', 'drop') then raise exception 'невідома дія' using errcode = '22023'; end if;
  if p_action = 'fix' and not (coalesce(p_min, 0) > 0 and coalesce(p_max, 0) > p_min) then
    raise exception 'Межі: мінімум більший за 0 і менший за максимум' using errcode = '22023';
  end if;
  delete from public.buyer_limit_reports where buyer_id = p_buyer and item_id = p_item;
  if not found then raise exception 'Цей рядок уже розібрано' using errcode = 'P0002'; end if;
  if p_action = 'fix' then
    update public.buyer_items set min_price = p_min, max_price = p_max where buyer_id = p_buyer and item_id = p_item;
  end if;
end $$;

-- непідтверджені ціни, як price_pending (0043), але з ніками тих, хто вніс: це бачить лише admin
create or replace function public.admin_price_pending()
returns table (buyer_id text, item_id bigint, item text, price bigint, votes int, need int, last_at timestamptz, reporters text[])
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  return query
  select r.buyer_id, r.item_id, i.name, r.price, count(distinct r.reporter)::int, pr.confirm_n, max(r.created_at),
         array_agg(distinct coalesce(nullif(btrim(p.nick), ''), p.name))
  from public.price_reports r
  join public.buyer_items bi on bi.buyer_id = r.buyer_id and bi.item_id = r.item_id
  join public.items i on i.id = r.item_id
  join public.profiles p on p.id = r.reporter
  cross join public.price_rules pr
  where r.kind = 'buyer' and not r.confirmed and r.created_at > now() - pr.confirm_window
    and (bi.price_at is null or r.created_at > bi.price_at) and r.price is distinct from bi.price
  group by r.buyer_id, r.item_id, i.name, r.price, pr.confirm_n
  order by max(r.created_at) desc;
end $$;

-- відкинути непідтверджену ціну: прибрати голоси за неї після останньої зміни ціни скупника
create or replace function public.admin_price_reject(p_buyer text, p_item bigint, p_price bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  delete from public.price_reports r
  using public.buyer_items bi
  where bi.buyer_id = p_buyer and bi.item_id = p_item
    and r.kind = 'buyer' and r.buyer_id = p_buyer and r.item_id = p_item and r.price = p_price and not r.confirmed
    and (bi.price_at is null or r.created_at > bi.price_at);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Цей рядок уже розібрано' using errcode = 'P0002'; end if;
  return n;
end $$;

-- ---------- стан програми ----------

alter table public.app_presence add column if not exists version text;
alter table public.app_presence add column if not exists first_seen timestamptz not null default now();

-- програма передає свою версію; старі збірки кличуть без аргументу — працює й так (версія null)
drop function if exists public.app_ping();
create or replace function public.app_ping(p_version text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v text := case when p_version ~ '^\d+\.\d+\.\d+$' then p_version end;
begin
  if auth.uid() is null then raise exception 'потрібен вхід' using errcode = '42501'; end if;
  insert into public.app_presence (user_id, seen_at, version) values (auth.uid(), now(), v)
    on conflict (user_id) do update set seen_at = excluded.seen_at, version = excluded.version;
end $$;
revoke all on function public.app_ping(text) from public, anon;
grant execute on function public.app_ping(text) to authenticated;

create or replace function public.admin_app_stats() returns json
language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Europe/Kyiv')::date;
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  return json_build_object(
    'online_3m', (select count(*) from public.app_presence where seen_at > now() - interval '3 minutes'),
    'online_24h', (select count(*) from public.app_presence where seen_at > now() - interval '24 hours'),
    'versions', coalesce((select json_agg(json_build_object('version', version, 'n', n)) from (
      select version, count(*)::int as n from public.app_presence
      where seen_at > now() - interval '7 days' group by version) v), '[]'::json),
    'ai', (select json_build_object('requests', coalesce(sum(n), 0), 'users', count(*), 'capped', count(*) filter (where n >= 50), 'limit', 50)
           from public.assistant_usage where day = today),
    'downloads', (select json_build_object('n', n, 'since', since) from public.site_counters where key = 'downloads'));
end $$;

-- ---------- гравці й ролі ----------

-- пошук акаунта: лише нік, Discord, роль, дати, версія й персонажі (ім'я, статік) — без обліку й балансів
create or replace function public.admin_find_accounts(q text)
returns table (id uuid, nick text, name text, avatar_url text, role text, created_at timestamptz,
               last_seen timestamptz, version text, characters json)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare s text := btrim(coalesce(q, ''));
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  if char_length(s) < 2 then raise exception 'Впиши щонайменше 2 символи' using errcode = '22023'; end if;
  s := '%' || replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select p.id, p.nick, p.name, p.avatar_url, p.role, p.created_at, a.seen_at, a.version,
         coalesce((select json_agg(json_build_object('name', c.name, 'static_id', c.static_id) order by c.created_at)
                   from public.characters c where c.owner = p.id), '[]'::json)
  from public.profiles p
  left join public.app_presence a on a.user_id = p.id
  where p.nick ilike s or p.name ilike s
  order by p.nick nulls last, p.name
  limit 20;
end $$;

-- роль: свою admin зняти не можна, останнього admin — теж (решта адмінів блокується, поки рахуємо)
create or replace function public.admin_set_role(p_user uuid, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare cur text; admins int;
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  if p_role not in ('user', 'editor', 'moderator', 'admin') then raise exception 'Невідома роль' using errcode = '22023'; end if;
  if p_user = auth.uid() and p_role <> 'admin' then raise exception 'Свою роль admin зняти не можна' using errcode = '22023'; end if;
  perform 1 from public.profiles where role = 'admin' for update;
  select role into cur from public.profiles where id = p_user;
  if not found then raise exception 'Немає такого акаунта' using errcode = '22023'; end if;
  if cur = 'admin' and p_role <> 'admin' then
    select count(*) into admins from public.profiles where role = 'admin';
    if admins <= 1 then raise exception 'Це останній admin — спершу признач іншого' using errcode = '22023'; end if;
  end if;
  update public.profiles set role = p_role where id = p_user;
  return p_role;
end $$;

-- ---------- навчальні знімки ----------

create or replace function public.admin_training_shots(p_before timestamptz default null, p_limit int default 50)
returns table (name text, created_at timestamptz, owner uuid, nick text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  if p_limit not between 1 and 100 then raise exception 'Порція — 1–100 знімків' using errcode = '22023'; end if;
  return query
  select o.name, o.created_at, p.id, coalesce(nullif(btrim(p.nick), ''), p.name)
  from storage.objects o
  left join public.profiles p on p.id::text = split_part(o.name, '/', 1)
  where o.bucket_id = 'training' and o.name like '%.jpg' and (p_before is null or o.created_at < p_before)
  order by o.created_at desc
  limit p_limit;
end $$;

-- ---------- права ----------

do $$
declare f text;
begin
  foreach f in array array[
    'admin_queue_counts()', 'admin_unknown_resolve(bigint, text, bigint, text, text)',
    'admin_limit_resolve(text, bigint, text, bigint, bigint)', 'admin_price_pending()',
    'admin_price_reject(text, bigint, bigint)', 'admin_app_stats()', 'admin_find_accounts(text)',
    'admin_set_role(uuid, text)', 'admin_training_shots(timestamptz, int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
