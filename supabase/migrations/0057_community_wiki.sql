-- Q-Hub 0057: довідник від гравців (specs/043, конституція 1.3.0 — принцип II).
-- Гравці пропонують правки й нові сторінки «Робіт» і «Транспорту»; публікують лише admin і moderator функцією
-- wiki_decide (білий список полів, перевірка версії); кожна публікація — версія в історії, відкат — wiki_revert.
-- • jobs            — роботи переїжджають з src/data/jobs.ts (дані — вкінці файлу, on conflict do nothing)
-- • vehicles        — + hidden, version, created_by, updated_by, updated_at; прямий запис лише admin (було is_staff)
-- • wiki_proposals  — пропозиції; wiki_versions — історія (лише додається); wiki_settings, wiki_bans
-- • wiki_contributors — рейтинг; bucket wiki-proof — приватні скріни-докази
-- Помилки — людським текстом з errcode QH001…QH014 (contracts/wiki-rpc.md).

-- ---------- роботи ----------
create or replace function public.wiki_list_ok(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(array_length(p, 1), 0) <= 30 and coalesce(bool_and(char_length(x) between 1 and 400), true) from unnest(p) x
$$;

create table if not exists public.jobs (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  legal boolean not null default true,
  level integer not null default 0 check (level between 0 and 100),
  profit smallint not null default 0 check (profit between 0 and 3),
  requirements text[] not null default '{}' check (public.wiki_list_ok(requirements)),
  features text[] not null default '{}' check (public.wiki_list_ok(features)),
  location text[] not null default '{}' check (public.wiki_list_ok(location)),
  skills text[] not null default '{}' check (public.wiki_list_ok(skills)),
  progress text[] not null default '{}' check (public.wiki_list_ok(progress)),
  controls text[] not null default '{}' check (public.wiki_list_ok(controls)),
  tips text[] not null default '{}' check (public.wiki_list_ok(tips)),
  description text not null default '' check (char_length(description) <= 3000),
  pay text not null default '' check (char_length(pay) <= 300),
  forum boolean not null default false,
  hidden boolean not null default false,
  version bigint not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists jobs_name_lower on public.jobs (lower(name));

-- ---------- транспорт: версія й автори ----------
alter table public.vehicles
  add column if not exists hidden boolean not null default false,
  add column if not exists version bigint not null default 1,
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at timestamptz;

-- ---------- пропозиції й історія ----------
create table if not exists public.wiki_proposals (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('job', 'vehicle')),
  target_id text,
  kind text not null check (kind in ('new', 'edit', 'hide')),
  data jsonb not null default '{}',
  base_version bigint,
  source text not null check (source in ('game', 'discord', 'forum', 'own')),
  source_note text not null default '' check (char_length(source_note) <= 300),
  proof_path text not null default '',
  author uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'accepted_edited', 'rejected', 'conflict', 'withdrawn')),
  reason text not null default '' check (char_length(reason) <= 300),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  seen_at timestamptz,
  version_id bigint,
  created_at timestamptz not null default now(),
  constraint wiki_proposals_new_target check ((kind = 'new') = (target_id is null)),
  constraint wiki_proposals_reject_reason check (status <> 'rejected' or reason <> ''),
  constraint wiki_proposals_decided check (status in ('pending', 'conflict', 'withdrawn') or decided_at is not null)
);
create index if not exists wiki_proposals_queue on public.wiki_proposals (status, created_at);
create index if not exists wiki_proposals_target on public.wiki_proposals (section, target_id);
create index if not exists wiki_proposals_author on public.wiki_proposals (author, status);

create table if not exists public.wiki_versions (
  id bigint generated always as identity primary key,
  section text not null check (section in ('job', 'vehicle')),
  target_id text not null,
  version_no bigint not null,
  data jsonb not null,
  kind text not null check (kind in ('seed', 'accept', 'revert', 'hide', 'unhide', 'admin')),
  proposal_id uuid references public.wiki_proposals (id) on delete set null,
  author uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (section, target_id, version_no)
);

create table if not exists public.wiki_settings (
  id boolean primary key default true check (id),
  max_pending integer not null default 10 check (max_pending between 1 and 100),
  stale_days integer not null default 30 check (stale_days between 1 and 365),
  proof_days integer not null default 30 check (proof_days between 1 and 365)
);
insert into public.wiki_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.wiki_bans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 300),
  by uuid references public.profiles (id) on delete set null,
  at timestamptz not null default now()
);

-- місце під P3 (US6): «Актуально» й примітки — інтерфейс пізніше, поки лише admin
create table if not exists public.wiki_checks (
  section text not null, target_id text not null, version_no bigint not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (section, target_id, version_no, user_id)
);
create table if not exists public.wiki_notes (
  id bigint generated always as identity primary key,
  section text not null, target_id text not null,
  author uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- хто модерує ----------
create or replace function public.is_wiki_mod() returns boolean
language sql stable as $$ select public.my_role() in ('admin', 'moderator') $$;

-- ---------- права ----------
alter table public.jobs enable row level security;
alter table public.wiki_proposals enable row level security;
alter table public.wiki_versions enable row level security;
alter table public.wiki_settings enable row level security;
alter table public.wiki_bans enable row level security;
alter table public.wiki_checks enable row level security;
alter table public.wiki_notes enable row level security;

drop policy if exists "jobs: read" on public.jobs;
drop policy if exists "jobs: admin write" on public.jobs;
create policy "jobs: read" on public.jobs for select using (not hidden or public.is_wiki_mod());
create policy "jobs: admin write" on public.jobs for all using (public.is_admin()) with check (public.is_admin());

-- транспорт: правка лише admin напряму (принцип II); editor і moderator — пропозиціями
drop policy if exists "vehicles: read all" on public.vehicles;
drop policy if exists "vehicles: staff write" on public.vehicles;
drop policy if exists "vehicles: read" on public.vehicles;
drop policy if exists "vehicles: admin write" on public.vehicles;
create policy "vehicles: read" on public.vehicles for select using (not hidden or public.is_wiki_mod());
create policy "vehicles: admin write" on public.vehicles for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "wiki proposals: read" on public.wiki_proposals;
drop policy if exists "wiki proposals: add own" on public.wiki_proposals;
drop policy if exists "wiki proposals: author update" on public.wiki_proposals;
create policy "wiki proposals: read" on public.wiki_proposals for select using (author = auth.uid() or public.is_wiki_mod());
create policy "wiki proposals: add own" on public.wiki_proposals for insert to authenticated
  with check (author = auth.uid() and status = 'pending' and decided_at is null and decided_by is null);
-- автор лише відкликає свою пропозицію й позначає рішення побаченим — решту перевіряє тригер wiki_proposal_guard
create policy "wiki proposals: author update" on public.wiki_proposals for update to authenticated
  using (author = auth.uid()) with check (author = auth.uid());

drop policy if exists "wiki versions: read" on public.wiki_versions;
create policy "wiki versions: read" on public.wiki_versions for select using (true);

drop policy if exists "wiki settings: read" on public.wiki_settings;
drop policy if exists "wiki settings: admin" on public.wiki_settings;
create policy "wiki settings: read" on public.wiki_settings for select using (true);
create policy "wiki settings: admin" on public.wiki_settings for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "wiki bans: read" on public.wiki_bans;
drop policy if exists "wiki bans: mods" on public.wiki_bans;
create policy "wiki bans: read" on public.wiki_bans for select using (user_id = auth.uid() or public.is_wiki_mod());
create policy "wiki bans: mods" on public.wiki_bans for all using (public.is_wiki_mod()) with check (public.is_wiki_mod());

drop policy if exists "wiki checks: admin" on public.wiki_checks;
drop policy if exists "wiki notes: admin" on public.wiki_notes;
create policy "wiki checks: admin" on public.wiki_checks for all using (public.is_admin()) with check (public.is_admin());
create policy "wiki notes: admin" on public.wiki_notes for all using (public.is_admin()) with check (public.is_admin());

revoke insert, update, delete on public.jobs, public.wiki_proposals, public.wiki_versions, public.wiki_settings, public.wiki_bans, public.wiki_checks, public.wiki_notes from anon;
grant select on public.jobs, public.wiki_versions, public.wiki_settings to anon;
grant select, insert, update, delete on public.jobs, public.wiki_proposals, public.wiki_versions, public.wiki_settings, public.wiki_bans, public.wiki_checks, public.wiki_notes to authenticated;

-- ---------- перевірка полів пропозиції (білий список, contracts/wiki-rpc.md) ----------
create or replace function public.wiki_bad(p_field text, p_why text) returns void
language plpgsql as $$
begin
  raise exception using errcode = 'QH003', message = format('Поле «%s» не можна змінити так: %s.', p_field, p_why);
end $$;

create or replace function public.wiki_clean(p_section text, p_data jsonb, p_new boolean) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  k text; v jsonb; n numeric;
  job_lists text[] := array['requirements', 'features', 'location', 'skills', 'progress', 'controls', 'tips'];
  job_keys text[] := array['name', 'legal', 'level', 'profit', 'description', 'pay'] || job_lists;
  car_keys text[] := array['name', 'real_name', 'brand', 'salon', 'kind', 'fuel', 'currency', 'exclusive', 'vinyl',
                           'price', 'salon_price', 'min_level', 'speed', 'trunk', 'tank', 'seats', 'ua_plate'];
  car_nums text[] := array['salon_price', 'min_level', 'speed', 'trunk', 'tank', 'seats'];
begin
  if jsonb_typeof(p_data) <> 'object' then perform public.wiki_bad('дані', 'очікується набір полів'); end if;
  for k, v in select * from jsonb_each(p_data) loop
    if p_section = 'job' then
      if k = 'id' and p_new then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[a-z0-9-]{2,40}$' then perform public.wiki_bad('адреса', 'лише латинські літери, цифри й дефіс, 2–40'); end if;
      elsif not k = any (job_keys) then perform public.wiki_bad(k, 'це поле не пропонується');
      elsif k = 'name' then
        if jsonb_typeof(v) <> 'string' or char_length(btrim(v #>> '{}')) not between 1 and 60 then perform public.wiki_bad('Назва', 'від 1 до 60 символів'); end if;
      elsif k = 'legal' then
        if jsonb_typeof(v) <> 'boolean' then perform public.wiki_bad('Легальна', 'так або ні'); end if;
      elsif k in ('level', 'profit') then
        if jsonb_typeof(v) <> 'number' then perform public.wiki_bad(k, 'ціле число'); end if;
        n := (v #>> '{}')::numeric;
        /* case — у дужках: інакше plpgsql бере його then за кінець умови if */
        if n <> trunc(n) or n < 0 or n > (case k when 'level' then 100 else 3 end) then
          perform public.wiki_bad(case k when 'level' then 'Рівень' else 'Прибутковість' end, case k when 'level' then 'від 0 до 100' else 'від 0 до 3' end);
        end if;
      elsif k = 'description' then
        if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 3000 then perform public.wiki_bad('Опис', 'до 3000 символів'); end if;
      elsif k = 'pay' then
        if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 300 then perform public.wiki_bad('Оплата', 'до 300 символів'); end if;
      elsif k = any (job_lists) then
        if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 30
           or exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or char_length(x #>> '{}') not between 1 and 400) then
          perform public.wiki_bad(k, 'до 30 пунктів, кожен від 1 до 400 символів');
        end if;
      end if;
    elsif p_section = 'vehicle' then
      if not k = any (car_keys) then perform public.wiki_bad(k, 'це поле не пропонується');
      elsif k = 'name' then
        if jsonb_typeof(v) <> 'string' or char_length(btrim(v #>> '{}')) not between 1 and 80 then perform public.wiki_bad('Назва', 'від 1 до 80 символів'); end if;
      elsif k in ('real_name', 'brand', 'salon') then
        if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 80 then perform public.wiki_bad(k, 'до 80 символів'); end if;
      elsif k = 'kind' then
        if (v #>> '{}') is null or (v #>> '{}') not in ('auto', 'moto', 'avia', 'boat') then perform public.wiki_bad('Тип', 'авто, мото, авіа чи човен'); end if;
      elsif k = 'fuel' then
        if (v #>> '{}') is null or (v #>> '{}') not in ('petrol', 'diesel', 'electric') then perform public.wiki_bad('Двигун', 'бензин, дизель чи електро'); end if;
      elsif k = 'currency' then
        if (v #>> '{}') is null or (v #>> '{}') not in ('game', 'donate') then perform public.wiki_bad('Валюта', 'ігрова чи донат'); end if;
      elsif k in ('exclusive', 'vinyl') then
        if jsonb_typeof(v) <> 'boolean' then perform public.wiki_bad(k, 'так або ні'); end if;
      elsif k = 'ua_plate' then
        if jsonb_typeof(v) not in ('boolean', 'null') then perform public.wiki_bad('Український номер', 'так, ні чи невідомо'); end if;
      elsif k = 'price' or k = any (car_nums) then
        if not (jsonb_typeof(v) = 'number' or (jsonb_typeof(v) = 'null' and k <> 'price')) then perform public.wiki_bad(k, 'ціле число без мінуса'); end if;
        if jsonb_typeof(v) = 'number' then
          n := (v #>> '{}')::numeric;
          if n <> trunc(n) or n < 0 then perform public.wiki_bad(k, 'ціле число без мінуса'); end if;
        end if;
      end if;
    else
      raise exception using errcode = 'QH003', message = 'Невідомий розділ довідника.';
    end if;
  end loop;
  if p_new then
    if not p_data ? 'name' then perform public.wiki_bad('Назва', 'обов''язкова для нової сторінки'); end if;
    if p_section = 'job' and not p_data ? 'id' then perform public.wiki_bad('адреса', 'обов''язкова для нової роботи'); end if;
    if p_section = 'vehicle' and not p_data ? 'kind' then perform public.wiki_bad('Тип', 'обов''язковий для нового транспорту'); end if;
  end if;
  return p_data;
end $$;

-- знімок полів цілі (білий список + hidden) — для історії
create or replace function public.wiki_snapshot(p_section text, p_target text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case p_section
    when 'job' then (select jsonb_build_object('id', j.id, 'name', j.name, 'legal', j.legal, 'level', j.level, 'profit', j.profit,
      'requirements', j.requirements, 'features', j.features, 'location', j.location, 'skills', j.skills, 'progress', j.progress,
      'controls', j.controls, 'tips', j.tips, 'description', j.description, 'pay', j.pay, 'hidden', j.hidden)
      from public.jobs j where j.id = p_target)
    when 'vehicle' then (select jsonb_build_object('name', v.name, 'real_name', v.real_name, 'brand', v.brand, 'salon', v.salon,
      'kind', v.kind, 'fuel', v.fuel, 'currency', v.currency, 'exclusive', v.exclusive, 'vinyl', v.vinyl, 'price', v.price,
      'salon_price', v.salon_price, 'min_level', v.min_level, 'speed', v.speed, 'trunk', v.trunk, 'tank', v.tank,
      'seats', v.seats, 'ua_plate', v.ua_plate, 'hidden', v.hidden)
      from public.vehicles v where v.id::text = p_target)
  end
$$;

create or replace function public.wiki_version_of(p_section text, p_target text) returns bigint
language sql stable security definer set search_path = '' as $$
  select case p_section
    when 'job' then (select version from public.jobs where id = p_target)
    when 'vehicle' then (select version from public.vehicles where id::text = p_target)
  end
$$;

-- ---------- нова пропозиція: заборона, ліміт, поля, версія ----------
create or replace function public.wiki_proposal_new() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b record; lim integer; cnt integer;
begin
  select * into b from public.wiki_bans where user_id = new.author;
  if found then
    raise exception using errcode = 'QH001', message = format('Тобі заборонено пропонувати правки: %s. Питання — у Discord Q-Hub.', b.reason);
  end if;
  select max_pending into lim from public.wiki_settings where id;
  select count(*) into cnt from public.wiki_proposals where author = new.author and status = 'pending';
  if cnt >= coalesce(lim, 10) then
    raise exception using errcode = 'QH002', message = format('На розгляді вже %s твоїх пропозицій — дочекайся рішення по них.', cnt);
  end if;
  if new.kind = 'hide' then new.data := '{}'; else new.data := public.wiki_clean(new.section, new.data, new.kind = 'new'); end if;
  if new.kind <> 'new' then
    if public.wiki_version_of(new.section, new.target_id) is null then
      raise exception using errcode = 'QH014', message = 'Такої сторінки немає.';
    end if;
    new.base_version := coalesce(new.base_version, public.wiki_version_of(new.section, new.target_id));
  else
    new.base_version := null;
  end if;
  /* status, decided_* не чіпаємо: «одразу прийняту» пропозицію відхиляє RLS (wiki proposals: add own) */
  new.reason := ''; new.seen_at := null; new.version_id := null;
  return new;
end $$;
drop trigger if exists wiki_proposal_new on public.wiki_proposals;
create trigger wiki_proposal_new before insert on public.wiki_proposals for each row execute function public.wiki_proposal_new();

-- автор може лише відкликати (pending → withdrawn) і позначити побаченим; рішення — лише функції (прапорець qhub.wiki)
create or replace function public.wiki_proposal_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('qhub.wiki', true), '') = '1' then return new; end if;
  if (to_jsonb(new) - 'status' - 'seen_at') <> (to_jsonb(old) - 'status' - 'seen_at')
     or (new.status <> old.status and not (old.status = 'pending' and new.status = 'withdrawn')) then
    raise exception using errcode = 'QH010', message = 'Змінити пропозицію можна лише відкликавши її.';
  end if;
  return new;
end $$;
drop trigger if exists wiki_proposal_guard on public.wiki_proposals;
create trigger wiki_proposal_guard before update on public.wiki_proposals for each row execute function public.wiki_proposal_guard();

-- ---------- застосувати поля до цілі й записати версію ----------
create or replace function public.wiki_apply(p_section text, p_target text, p_data jsonb, p_kind text, p_proposal uuid,
  p_author uuid, p_note text) returns table (target_id text, version_no bigint, version_id bigint)
language plpgsql security definer set search_path = '' as $$
declare j public.jobs; v public.vehicles; t text := p_target; ver bigint; vid bigint;
begin
  if p_section = 'job' then
    if t is null then
      insert into public.jobs (id, name, created_by, updated_by) values (p_data ->> 'id', btrim(p_data ->> 'name'), p_author, p_author)
        returning id into t;
    elsif not exists (select 1 from public.wiki_versions w where w.section = 'job' and w.target_id = t) then
      insert into public.wiki_versions (section, target_id, version_no, data, kind)
        select 'job', t, jj.version, public.wiki_snapshot('job', t), 'seed' from public.jobs jj where jj.id = t;
    end if;
    select * into j from public.jobs where id = t for update;
    j := jsonb_populate_record(j, p_data - 'id');
    update public.jobs set name = btrim(j.name), legal = j.legal, level = j.level, profit = j.profit,
      requirements = j.requirements, features = j.features, location = j.location, skills = j.skills, progress = j.progress,
      controls = j.controls, tips = j.tips, description = j.description, pay = j.pay, hidden = j.hidden,
      version = case when p_target is null then 1 else version + 1 end,
      updated_by = coalesce(p_author, updated_by), updated_at = now()
      where id = t returning version into ver;
  elsif p_section = 'vehicle' then
    if t is null then
      insert into public.vehicles (name, kind, created_by, updated_by) values (btrim(p_data ->> 'name'), p_data ->> 'kind', p_author, p_author)
        returning id::text into t;
    elsif not exists (select 1 from public.wiki_versions w where w.section = 'vehicle' and w.target_id = t) then
      insert into public.wiki_versions (section, target_id, version_no, data, kind)
        select 'vehicle', t, vv.version, public.wiki_snapshot('vehicle', t), 'seed' from public.vehicles vv where vv.id::text = t;
    end if;
    select * into v from public.vehicles where id::text = t for update;
    v := jsonb_populate_record(v, p_data);
    update public.vehicles set name = btrim(v.name), real_name = v.real_name, brand = v.brand, salon = v.salon, kind = v.kind,
      fuel = v.fuel, currency = v.currency, exclusive = v.exclusive, vinyl = v.vinyl, price = v.price,
      salon_price = v.salon_price, min_level = v.min_level, speed = v.speed, trunk = v.trunk, tank = v.tank,
      seats = v.seats, ua_plate = v.ua_plate, hidden = v.hidden,
      version = case when p_target is null then 1 else version + 1 end,
      updated_by = coalesce(p_author, updated_by), updated_at = now()
      where id::text = t returning version into ver;
  else
    raise exception using errcode = 'QH003', message = 'Невідомий розділ довідника.';
  end if;
  insert into public.wiki_versions (section, target_id, version_no, data, kind, proposal_id, author, decided_by, note)
    values (p_section, t, ver, public.wiki_snapshot(p_section, t), p_kind, p_proposal, p_author, auth.uid(), coalesce(p_note, ''))
    returning id into vid;
  -- інші пропозиції до цієї сторінки писались до нової версії
  perform set_config('qhub.wiki', '1', true);
  update public.wiki_proposals set status = 'conflict'
    where section = p_section and wiki_proposals.target_id = t and status = 'pending' and id is distinct from p_proposal;
  return query select t, ver, vid;
end $$;

-- ---------- рішення модератора ----------
create or replace function public.wiki_decide(p_id uuid, p_action text, p_data jsonb default null, p_reason text default '',
  p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.wiki_proposals; d jsonb; cur bigint; r record; st text;
begin
  if not public.is_wiki_mod() then
    raise exception using errcode = 'QH010', message = 'Приймати правки можуть лише модератори.';
  end if;
  select * into p from public.wiki_proposals where id = p_id for update;
  if not found or p.status not in ('pending', 'conflict') then
    raise exception using errcode = 'QH012', message = 'Цю пропозицію вже розглянуто.';
  end if;
  perform set_config('qhub.wiki', '1', true);
  if p_action = 'reject' then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception using errcode = 'QH011', message = 'Вкажи причину відхилення.';
    end if;
    update public.wiki_proposals set status = 'rejected', reason = left(btrim(p_reason), 300), decided_by = auth.uid(), decided_at = now()
      where id = p_id;
    return jsonb_build_object('status', 'rejected');
  elsif p_action <> 'accept' then
    raise exception using errcode = 'QH003', message = 'Невідома дія: ' || coalesce(p_action, '');
  end if;

  if p.kind <> 'new' then
    cur := public.wiki_version_of(p.section, p.target_id);
    if cur is null then raise exception using errcode = 'QH014', message = 'Такої сторінки вже немає.'; end if;
    if (p.status = 'conflict' or p.base_version is distinct from cur) and not p_force then
      raise exception using errcode = 'QH013', message = 'Картку змінили після цієї пропозиції — переглянь зміни поверх нової версії.';
    end if;
  end if;

  if p.kind = 'hide' then
    d := '{"hidden": true}';
  else
    d := public.wiki_clean(p.section, coalesce(p_data, p.data), p.kind = 'new');
    if p.kind = 'new' and p.section = 'job' and exists (select 1 from public.jobs where id = d ->> 'id') then
      raise exception using errcode = 'QH003', message = 'Робота з такою адресою вже є — зміни адресу.';
    end if;
    /* назва унікальна (без урахування регістру) — людським текстом, а не помилкою індексу */
    if d ? 'name' and (
      (p.section = 'job' and exists (select 1 from public.jobs where lower(name) = lower(btrim(d ->> 'name')) and id is distinct from p.target_id))
      or (p.section = 'vehicle' and exists (select 1 from public.vehicles where lower(name) = lower(btrim(d ->> 'name')) and id::text is distinct from p.target_id))) then
      raise exception using errcode = 'QH003', message = format('Сторінка «%s» вже є — це дубль?', btrim(d ->> 'name'));
    end if;
  end if;
  st := case when p_data is not null and p_data <> p.data then 'accepted_edited' else 'accepted' end;
  select * into r from public.wiki_apply(p.section, p.target_id, d, case when p.kind = 'hide' then 'hide' else 'accept' end,
    p.id, p.author, case when st = 'accepted_edited' then 'з правками модератора' else '' end);
  /* target_id нової сторінки не пишемо (правило new ⇔ без цілі) — адресу видно з версії version_id */
  update public.wiki_proposals set status = st, decided_by = auth.uid(), decided_at = now(), version_id = r.version_id,
    reason = left(btrim(coalesce(p_reason, '')), 300)
    where id = p_id;
  return jsonb_build_object('status', st, 'target_id', r.target_id, 'version_no', r.version_no);
end $$;

-- ---------- відкат до версії й повернення прибраної сторінки ----------
create or replace function public.wiki_revert(p_section text, p_target text, p_version bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d jsonb; r record;
begin
  if not public.is_wiki_mod() then
    raise exception using errcode = 'QH010', message = 'Повертати версії можуть лише модератори.';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception using errcode = 'QH011', message = 'Вкажи причину відкату.'; end if;
  select data into d from public.wiki_versions where section = p_section and target_id = p_target and version_no = p_version;
  if d is null then raise exception using errcode = 'QH014', message = 'Такої версії немає.'; end if;
  select * into r from public.wiki_apply(p_section, p_target, d - 'id', 'revert', null, null, left(btrim(p_reason), 300));
  return jsonb_build_object('version_no', r.version_no);
end $$;

create or replace function public.wiki_unhide(p_section text, p_target text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if not public.is_wiki_mod() then
    raise exception using errcode = 'QH010', message = 'Повертати сторінки можуть лише модератори.';
  end if;
  if public.wiki_version_of(p_section, p_target) is null then raise exception using errcode = 'QH014', message = 'Такої сторінки немає.'; end if;
  select * into r from public.wiki_apply(p_section, p_target, '{"hidden": false}', 'unhide', null, null, left(btrim(coalesce(p_reason, '')), 300));
  return jsonb_build_object('version_no', r.version_no);
end $$;

-- рішення по своїх пропозиціях побачено (значок у кабінеті, FR-018)
create or replace function public.wiki_seen() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('qhub.wiki', '1', true);
  update public.wiki_proposals set seen_at = now() where author = auth.uid() and decided_at is not null and seen_at is null;
end $$;

revoke execute on function public.wiki_apply(text, text, jsonb, text, uuid, uuid, text) from public, anon, authenticated;
-- знімок і версія читають і приховані сторінки — лише для функцій вище, не для викликів з сайту
revoke execute on function public.wiki_snapshot(text, text) from public, anon, authenticated;
revoke execute on function public.wiki_version_of(text, text) from public, anon, authenticated;
revoke execute on function public.wiki_decide(uuid, text, jsonb, text, boolean) from public, anon;
revoke execute on function public.wiki_revert(text, text, bigint, text) from public, anon;
revoke execute on function public.wiki_unhide(text, text, text) from public, anon;
revoke execute on function public.wiki_seen() from public, anon;
grant execute on function public.wiki_decide(uuid, text, jsonb, text, boolean) to authenticated;
grant execute on function public.wiki_revert(text, text, bigint, text) to authenticated;
grant execute on function public.wiki_unhide(text, text, text) to authenticated;
grant execute on function public.wiki_seen() to authenticated;

-- ---------- рейтинг і автори для карток (імена — лише тих, чиї правки прийнято) ----------
create or replace view public.wiki_contributors as
select pr.id, pr.name, pr.avatar_url,
       count(*) filter (where p.status in ('accepted', 'accepted_edited') and p.kind <> 'new') as accepted_edits,
       count(*) filter (where p.status in ('accepted', 'accepted_edited') and p.kind = 'new') as accepted_pages,
       count(*) filter (where p.status = 'rejected') as rejected,
       max(p.decided_at) as last_at
from public.wiki_proposals p join public.profiles pr on pr.id = p.author
group by pr.id, pr.name, pr.avatar_url
having count(*) filter (where p.status in ('accepted', 'accepted_edited')) > 0;
grant select on public.wiki_contributors to anon, authenticated;

-- ---------- скріни-докази: приватно, своя тека, читають автор і модератори (принцип III) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('wiki-proof', 'wiki-proof', false, 3145728, array['image/webp', 'image/png', 'image/jpeg'])
  on conflict (id) do nothing;
drop policy if exists "wiki-proof: upload own" on storage.objects;
drop policy if exists "wiki-proof: author or mods read" on storage.objects;
drop policy if exists "wiki-proof: author or mods delete" on storage.objects;
create policy "wiki-proof: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'wiki-proof' and split_part(name, '/', 1) = auth.uid()::text);
create policy "wiki-proof: author or mods read" on storage.objects for select to authenticated
  using (bucket_id = 'wiki-proof' and (split_part(name, '/', 1) = auth.uid()::text or public.is_wiki_mod()));
create policy "wiki-proof: author or mods delete" on storage.objects for delete to authenticated
  using (bucket_id = 'wiki-proof' and (split_part(name, '/', 1) = auth.uid()::text or public.is_wiki_mod()));

-- ---------- роботи з src/data/jobs.ts (scripts/jobs-seed.mjs); повтор нічого не затирає ----------
insert into public.jobs (id, name, legal, level, profit, requirements, features, location, skills, progress, controls, tips, description, pay, forum) values
  ('akvanavt', 'Акванавт', true, 7, 3, array['7 рівень персонажа', 'робота доступна всім']::text[], array['Під час збирання ящиків в них можна знайти Рапана, Морську зірку та Перлину.']::text[], array['Телефон - GPS - Робота - Акванавт']::text[], array['1 рівень - початковий, на 30 хвилин повітря.', '2 рівень - 500 очок, на 40 хвилин повітря.', '3 рівень - 2500 очок, на 50 хвилин повітря.', '4 рівень - 6000 очок, на 60 хвилин повітря.', '5 рівень - 8000 очок, на 70 хвилин повітря.']::text[], array['Одне замовлення = 1 очко']::text[], array['Занурення: Ctrl', 'Піднятись на поверхню: Shift', 'Також використовуйте клавіші на Num-Pad (4,5,6)']::text[], array['Для піднімання ящику спробуйте притиснутись до нього за допомогою "Ctrl" (слідкуйте за міцністю човна) при 0% втрачається керування батискафом.', 'Оберайте замовленя в радіусі мітки "поповнення повітря".']::text[], 'Влаштовуємось на роботу. Беремо підводний батискаф. Після чого вирушаємо на мітку поповнення повітря. Відкриваємо планшет на клавішу "J" та обираємо замовлення. Після чого, замовлення відмітиться на мапі, вирушаємо на мітку і починаємо занурення "Ctrl". Нам потрібно зібрати ящики на дні моря або на скелях.', 'Залежить від замовлення в планшеті.', true),
  ('bus', 'Водій автобуса', true, 1, 2, array['1 рівень персонажа', 'робота доступна всім']::text[], '{}'::text[], array['Телефон - GPS - Роботи - Водій автобуса.', 'Підійдіть до роботодавця Серпень Браун, поговоріть та натисніть кнопку "Влаштуватися".']::text[], array['1 рівень - початковий.', '2 рівень - 200 очок, надбавка від n$ до n$.', '3 рівень - 600 очок, надбавка від n$ до n$.', '4 рівень - 1200 очок, надбавка від n$ до n$.', '5 рівень - 3000 очок, надбавка від n$ до n$.']::text[], array['1 пройдений маршрут = 1 очко']::text[], '{}'::text[], array['Відбуксуйте автобус щоб поновити кількість палива, полагодити його та відмінити маршрут.']::text[], 'Орендовуємо автобус на спеціальній точці, після чого відкриваємо планшет маршрутів на літеру "J" та вирушаємо по відзначених на мапі мітках.', 'Залежить від маршруту, вартість вказана в планшеті та нараховується під час видачі PayDay.', true),
  ('forklift', 'Водій навантажувача', true, 1, 0, array['1 рівень персонажа', 'робота доступна всім']::text[], '{}'::text[], array['Телефон - GPS - Робота - Водій навантажувача']::text[], array['1 рівень - початковий.', '2 рівень - 500 очок, надбавка від n$ до n$.', '3 рівень - 3000 очок, надбавка від n$ до n$.', '4 рівень - 6000 очок, надбавка від n$ до n$.', '5 рівень - 12000 очок, надбавка від n$ до n$.']::text[], array['1 перевезений вантаж = 1 очко']::text[], '{}'::text[], array['Відбуксуйте навантажувач щоб поновити кількість палива та полагодити його.']::text[], 'Влаштовуємось на роботу. Беремо навантажувач та відправляємось на склад, перевозити вантаж слідуючи міткам.', 'Залежить від відстані, від однієї мітки - до іншої.', true),
  ('lawnmower', 'Газонокосильник', true, 1, 0, array['1 рівень']::text[], array['Шанс знайти Косяк під час роботи (Якщо перебуваєте у банді/мафії).']::text[], array['Телефон - GPS - Заробіток - Газоноксильник']::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('mushroom', 'Грибник', true, 1, 1, array['1 рівень']::text[], '{}'::text[], array['Телефон - GPS - Заробіток - Грибник']::text[], array['1 рівень - збір печериць', '2 рівень - збір гливи', '3 рівень - збір опеньків', '4 рівень - збір мухоморів та лисичок', '5 рівень - збір сироїжок зелених', 'Зі збільшеним навиком Грибника відкривається доступ до збору кращих видів грибів на інших ділянках.']::text[], array['1 гриб = 1 очко']::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('trucker', 'Далекобійник', true, 3, 2, array['3 рівень персонажа', 'робота доступна всім']::text[], '{}'::text[], array['Телефон - GPS - Робота - Далекобійник']::text[], array['1 рівень - початковий, транспорт "MTL Pounder".', '2 рівень - 200 очок, транспорт "MTL Pounder (Custom)".', '3 рівень - 700 очок, транспорт "MTL BoxTruck АТБ", набуття активної навички "Безкоштовний ремонт в LSC".', '4 рівень - 3000 очок.', '5 рівень - 6500 очок, набуття активної навички "У транспорті не витрачається паливо".']::text[], array['1 замовлення = 1 очко.']::text[], '{}'::text[], array['Відбуксуйте фуру щоб поновити кількість палива та полагодити його.']::text[], 'Влаштовуємось на роботу, беремо фуру, відкриваємо планшет замовлення на клавішу "J" та вирушаємо на мітку загрузки, після успішної загрузки направляємось на місце розгрузки.', 'Залежить від відстані, від однієї мітки - до іншої, відображається в планшеті замовлень та нараховується під час видачі PayDay.', true),
  ('detective', 'Детектив', true, 3, 0, array['3 рівень персонажа', 'робота доступна цивільним, EMS, Репортерам та GOV']::text[], '{}'::text[], array['Телефон - GPS - Робота - Детектив']::text[], array['1 рівень - початковий, пошук 1 раз в 120 секунд.', '2 рівень - 700 очок, пошук 1 раз в 100 секунд.', '3 рівень - 2000 очок, пошук 1 раз в 90 секунд.', '4 рівень - 6000 очок, пошук 1 раз в 80 секунд.', '5 рівень - 15000 очок, пошук 1 раз в 60 секунд.']::text[], array['1 пошук гравця = 1 очко']::text[], '{}'::text[], '{}'::text[], 'Влаштовуємось на роботу. Після чого можна використовувати команда "/find <id>" для пошуку гравця, на карті з''явиться відповідна мітка.', 'Зарплата відсутня.', true),
  ('donor', 'Донор', true, 1, 0, array['1 рівень', 'Рівень здоров''я вище 75%']::text[], '{}'::text[], array['Телефон - GPS - Фракції - EMS']::text[], array['1 рівень - початковий, 3000$ та відновлюється 50% здоров''я.', '2 рівень - 200 очок, 3500$ та відновлюється 60% здоров''я.', '3 рівень - 800 очок, 4000$ та відновлюється 70% здоров''я.', '4 рівень - 3000 очок, 4500$ та відновлюється 85% здоров''я.', '5 рівень - 7000 очок, 5000$ та відновлюється 100% здоров''я.']::text[], array['1 здача крові = 1 очко']::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('tow', 'Евакуаторник', true, 2, 1, array['2 рівень навички Механіка', 'робота доступна всім']::text[], '{}'::text[], array['Телефон - GPS - Робота - Механік']::text[], array['1 рівень - початковий, транспорт - "Евакуатор QUANT".', '2 рівень - 200 очок, надбавка від n$ до n$.', '3 рівень - 700 очок, надбавка від n$ до n$.', '4 рівень - 2500 очок, надбавка від n$ до n$.', '5 рівень - 6500 очок, надбавка від n$ до n$.']::text[], array['1 евакуація автівки = 1 очко']::text[], '{}'::text[], array['Відбуксуйте евакуатор щоб поновити кількість палива, полагодити його та відмінити виклик.']::text[], 'Влаштовуємось на роботу. Беремо евакуатор, відкриваємо планшет викликів на літеру "J" та вирушаємо на відзначену на мапі мітку. По прибуттю до автівки натискаємо "Е" для її завантаження на евакуатор, після чого вирушаємо по вказаному маршруту для здачі автівки.', 'Залежить від відстані, від однієї мітки - до іншої, вартість вказана в планшеті.', true),
  ('electrician', 'Електрик', true, 3, 1, array['3 рівень персонажа', 'робота доступна всім']::text[], array['З 2 рівня навички з''являєтся шанс отримати радіодеталі, мікросхему та power bank (для заряджання електрокара) під час лагодження трансформатора.']::text[], array['Телефон - GPS - Робота - Електрик']::text[], array['1 рівень - початковий, замінити 5 запобіжників.', '2 рівень - 2000 очок, замінити 5 запобіжників.', '3 рівень - 5000 очок, замінити 4 запобіжника, випадають запчастини на мікросхему.', '4 рівень - 15000 очок, замінити 4 запобіжника.', '5 рівень - 30000 очок, замінити 3 запобіжника, є шанс вибити мікросхему.']::text[], array['1 полагоджений трансформатор = 1 очко']::text[], '{}'::text[], '{}'::text[], 'Влаштовуємось на роботу та перевдягаємось. Вирушаємо до пошкодженого трансформатора та ремонтуємо його (проходимо міні-гру, запам''ятовуємо 5 пошкоджених запобіжників, після чого заміняємо їх натискаючи на них). З 3 рівня навички є можливість взяти авто та працювати по місту, на виїзній роботі оплата збільшена.
Шанс отримати радіодеталі або мікросхему під час лагодження трансформатора.', 'Залежить від навички', true),
  ('inkasator', 'Інкасатор', true, 4, 2, array['4 рівень персонажа', 'робота доступна всім']::text[], array['Можливість працювати у бригаді (4 чоловіка з водієм). За кожну людину в бригаді - бригада отримує +10% до прибутку (Максимум: 30%).']::text[], array['Телефон - GPS - Робота - Інкасатор']::text[], array['1 рівень - початковий, транспорт "Brute Stockade".', '2 рівень - 200 очок, надбавка від 100$ до 150$.', '3 рівень - 600 очок, надбавка від 150$ до 200$, транспорт "T6 Ощадбанк", набуття пасивної навички відсутня комісія при банківському переказі.', '4 рівень - 2000 очок, надбавка від 200$ до 250$, транспорт "T6 Приватбанк".', '5 рівень - 8000 очок, надбавка від 250$ до 300$, навичка "Неможливість пограбувати"', 'Детальніше про навичку - "Поради".']::text[], array['Інкасація банкоматів. 1 банкомат = 1 очко. 25 банкоматів = 25 очок + 2 очка за здачку коштів у банку.']::text[], '{}'::text[], array['Відбуксуйте автомобіль щоб поновити кількість палива, оновити місцерозташування поточного банкомату та полагодити його.', 'При набутті навички "Неможливість пограбувати" на 5 рівні роботи, Ви маєте бути влаштовані Інкасатором, для того, щоб навичка була активною. При тому, всі РП-дії мають проводитись згідно правил (навичка не дає Вам можливість ігнорувати накази банди/мафії/байкерів - це буде розцінено як PG).']::text[], 'Влаштовуємось на роботу та перевдягаємось. Беремо автівку та вирушаємо на відзначену на мапі мітку. По прибуттю до банкомату - забираємо всю готівку після чого вирушаємо на наступну мітку.
Всього в автівку вміщаються інкасовані кошти з 25 банкоматів, після чого потрібно здати кошти у банку. За наповнення автівки коштами з 25 банкоматів - отримаєте додатково 3000$ після здачі коштів.
Можливість працювати у бригаді (4 чоловіка з водієм). За кожну людину в бригаді - бригада отримує +10% до прибутку (Максимум: 30%).', 'Залежить від відстані, від однієї мітки - до іншої.', true),
  ('kamenyar', 'Каменяр', true, 1, 1, array['1 рівень', 'Наявність кирки (Можна придбати в будь-якому магазині 24/7):', 'Звичайна кирка (Від першого рівня навички, дозволяє видобувати залізо та мідь)', 'Покращена кирка (Від другого рівня навички, дозволяє видобувати залізо, мідь та срібло)', 'Найкраща кирка (Від третього рівня навички, дозволяє добувати залізо, мідь, срібло, золото та алмази)']::text[], '{}'::text[], array['Телефон - GPS - Заробіток - Скупник металів (Для продажу металів)', 'Місця видобутку металів знаходяться у пустелі "Сенді-Шорс" та на кар''єрі "Девіс-Кварц"']::text[], array['1 рівень - початковий, доступ лише до звичайної кирки, добуток лише заліза та міді, для видобутку потрібно розбити 11 камінчиків.', '2 рівень - 700 очок, доступ до покращеної кирки, до видобутку додається срібло, для видобутку потрібно розбити 10 камінчиків.', '3 рівень - 3500 очок, доступ до найкращої кирки, до видобутку додається золото та алмази, для видобутку потрібно розбити 9 камінчиків.', '4 рівень - 10000 очок, для видобутку металу розбити 8 камінчиків.', '5 рівень - 40000 очок, для видобутку металу розбити 7 камінчиків.']::text[], array['Розбиття усіх камінчиків = 1 очко']::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('courier', 'Кур''єр', true, 1, 2, array['1 рівень персонажа', 'робота доступна всім']::text[], array['Можливість працювати на власному транспорті (з 3 рівня навички).']::text[], array['Телефон - GPS - Роботи - Кур''єр.', 'Підійдіть до роботодавця Фредерік Різ, поговоріть та натисніть кнопку "Влаштуватися".']::text[], array['1 рівень - початковий, транспорт - скутер "Pegassi Faggio Sport", можливість вміщати в рюкзак 5 замовлень.', '2 рівень - 200 очок, надбавка від 50$ до 100$, транспорт - маленький автомобіль "BF Club", можливість вміщати в рюкзак 8 замовлень.', '3 рівень - 600 очок, надбавка від 80$ до 150$, транспорт - власний, можливість вміщати в рюкзак 10 замовлень.', '4 рівень - 2500 очок, надбавка від 100$ до 200$, можливість вміщати в рюкзак 12 замовлень.', '5 рівень - 5500 очок, надбавка від 150$ до 250$, можливість вміщати в рюкзак 15 замовлень.']::text[], array['Доставка замовлень. 1 замовлення = 1 очко.']::text[], '{}'::text[], array['Відбуксуйте автомобіль щоб поновити кількість палива та полагодити його, або відмінити поточне замовлення.']::text[], 'Метою є доставка продуктів додому, крім автоматичних замовлень кур''єри отримують замовлення від гравців на доставку їжі до їхніх холодильників, оплата в такому разі вища. Необхідно переодягнутися в робочу форму. Наступаємо на значок біля Фредерік Різ. Як отримаємо робочу форму біжимо до значка , беремо зі складу сумку з товаром і сідаємо у скутер чи автомобіль. Після цього натискаємо клавішу J та вибираємо замовлення. Далі їдемо розвозити замовлення в будинки (на карті зазначено).
Коли доставимо 5 замовлень (на 1 навику) Вас знову відправить на склад.
Так само гравець може замовити у свій будинок їжу, у рядку "замовник" буде відображатися його нікнейм.', 'Залежить від відстані зі складу до будинку доставки та навика.
Є шанс знайти чайові під дверима.', true),
  ('lisorub', 'Лісоруб', true, 1, 1, array['1 рівень']::text[], '{}'::text[], array['Телефон - GPS - Заробіток - Скупник дерева']::text[], array['1 рівень - збір соснової колоди', '2 рівень - збір дубової колоди', '3 рівень - збір березової колоди', '4 рівень - збір кленової колоди', 'Зі збільшеним навиком Лісоруба відкривається доступ до вирубки кращих видів дерев.']::text[], array['Зі звичайною сокирою 1 дерево =1 очко', 'З покращеною сокирою 1 дерево = 2 очки']::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('mechanic', 'Механік', true, 1, 0, array['1 рівень персонажа', 'робота доступна всім']::text[], '{}'::text[], array['Телефон - GPS - Роботи - Механік.', 'Підійдіть до роботодавця Гаррі Мейсон, поговоріть та натисніть кнопку "Влаштуватися".']::text[], array['1 рівень - початковий', '2 рівень - 200 очок, надбавка від n$ до n$, можливість працювати "Евакуаторником".', '3 рівень - 600 очок, надбавка від n$ до n$, можливість продавати каністру з 20л палива та ремкомплект.', '4 рівень - 1500 очок, надбавка від n$ до n$, безкоштовний виклик особистого транспорту.', '5 рівень - 3500 очок, надбавка від n$ до n$, можливість заміни масла та акумулятора.']::text[], array['1 послуга = 1 очко']::text[], '{}'::text[], array['Відбуксуйте транспорт щоб поновити кількість палива, полагодити його та відмінити виклик.']::text[], 'Метою є ремонт / заправка транспорту гравців. Беремо автівку на спеціальній мітці > , відкриваємо планшет викликів на літеру "J" та вирушаємо на відзначену на мапі мітку. По прибуттю до автівки натискаємо "Е" - "Робота", та обираємо потрібну дію: ремонтуємо авто, або ж заправляємо. З 3 рівня навички до послуг додається можливість продати каністру з 20л палива та ремкомплект, а з 5 рівня заміна акумулятора та оливи.', 'Залежить від вказаної вартості послуги (отримуєте 50%).', true),
  ('hunter', 'Мисливець', true, 1, 2, array['1 рівень', 'Наявність ліцензії на зброю', 'Наявність зброї та патронів']::text[], '{}'::text[], array['Телефон - GPS - Заробіток - Полювання (Для продажу шкір);', 'Карта спавну звірів']::text[], array['1 рівень - початковий.', '2 рівень - 300 очок, можливо отримати до 2 шкір з тушки.', '3 рівень - 1000 очок, можливо отримати до 3 шкір з тушки.', '4 рівень - 5000 очок, можливо отримати 4 шкір з тушки.', '5 рівень - 15000 очок, можливо отримати 5 шкір з тушки.']::text[], array['1 знята шкіра = 1 очко']::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('firefighter', 'Пожежник', true, 10, 1, array['10 рівень персонажа з военним квитком чи 25-ий без военного квитка', 'Робота доступна всім крім крайму']::text[], '{}'::text[], array['Телефон - GPS - Робота - Пожежник (У місті Палето-Бей).']::text[], array['1 рівень - початковий, 5000 літрів води у автівці.', '2 рівень - 500 очок, надбавка від 100$ до 150$, 6000 літрів води у автівці.', '3 рівень - 2500 очок, надбавка від 150$ до 200$, 7000 літрів води у автівці.', '4 рівень - 6000 очок, надбавка від 200$ до 250$, 8000 літрів води у автівці.', '5 рівень - 10000 очок, надбавка від 250$ до 300$, 9000 літрів води у автівці.']::text[], array['Гасіння пожеж: 1 виклик = 1 очко.']::text[], '{}'::text[], array['Відбуксуйте автомобіль щоб поновити кількість палива та полагодити його.']::text[], 'Влаштовуємось на роботу та перевдягаємось. Беремо автівку та на мітці заповнюємо її водою. Відкриваємо планшет викликів на клавішу "J" та обираємо виклик. Після чого виклик відмітиться на мапі, вирушаємо на мітку і гасимо пожежу спрямовуючи потік води в сторону полум''я, над полум''ям з''явиться прогрес-бар гасіння поточного займання.', 'Залежить від виклику. Інформація про вартість виклику відображається у планшеті на клавішу "J".', true),
  ('postman', 'Поштар', true, 1, 2, array['1 рівень персонажа', 'робота доступна всім']::text[], array['Можливість працювати у бригаді (4 чоловіка з водієм). За кожну людину в бригаді - бригада отримує +10% до прибутку (Максимум: 30%).']::text[], array['Телефон - GPS - Робота - Поштар']::text[], array['1 рівень - початковий, транспорт "Укрпошта" та 5 посилок.', '2 рівень - 300 очок, надбавка від 100$ до 150$ та 6 посилок.', '3 рівень - 800 очок, надбавка від 150$ до 200$, транспорт "Нова Пошта" та 7 посилок.', '4 рівень - 2000 очок, надбавка від 200$ до 250$ та 8 посилок.', '5 рівень - 6000 очок, надбавка від 250$ до 300$ та 10 посилок.']::text[], array['Доставка посилок. 1 посилка = 1 очко.']::text[], '{}'::text[], array['Відбуксуйте автомобіль щоб поновити кількість палива, оновити місцерозташування посилок та полагодити його.']::text[], 'Влаштовуємось на роботу та перевдягаємось. Беремо автівку та завантажуємо в неї посилки, після чого будинки, на котрі потрібно доставити посилки відмітяться на мапі. Вирушаємо на мітки в довільному порядку та розвантажуємо посилки перед цим наклеюючи на них марки. Після доставки певної кількості посилок - повертаємось на склад та завантажуємо нові.
Можливість працювати у бригаді (4 чоловіка з водієм). За кожну людину в бригаді - бригада отримує +10% до прибутку (Максимум: 30%).', 'Залежить від відстані, від склада - до будинку.', true),
  ('fastfood', 'Продавець фастфуду', true, 1, 0, array['1 рівень']::text[], '{}'::text[], array['Телефон - GPS - Заробіток - Продавець фастфуду']::text[], array['1 рівень - початковий, 10 одиниць фастфуду у фургоні.', '2 рівень - 500 очок, 15 одиниць фастфуду у фургоні', '3 рівень - 2000 очок, 20 одиниць фастфуду у фургоні', '4 рівень - 4000 очок, 25 одиниць фастфуду у фургоні', '5 рівень - 7000 очок, 30 одиниць фастфуду у фургоні, набуття пасивної навички "Голод не забирає здоров''я".']::text[], array['1 проданий фастфуд = 1 очко']::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('fisher', 'Рибак', true, 1, 1, array['1 рівень', 'Наявність вудки (можна придбати в будь-якому магазині 24/7)', 'Наявність підкормки (можна придбати в будь-якому магазині 24/7)', 'Звичайна підкормка', 'Покращена підкормка (+10% до ваги риби)', 'Підкормка "Екстра" (+15% до ваги риби)']::text[], '{}'::text[], array['Телефон - GPS - Заробіток - Скупник риби (Для продажу риби)', 'Місця вилову риби знаходьться в різних водоймах.']::text[], array['1 рівень - початковий, вилов лише Окуня, Оселедця, Скумбрії, Кефалі.', '2 рівень - 1000 очок, до вилову додається Горбуша і Тріска.', '3 рівень - 3000 очок, до вилову додається Тунець, Дорадо і Сібас.', '4 рівень - 6000 очок, до вилову додається Форель і Камбала.', '5 рівень - 20000 очок, до вилову додається Скат, Акула і Фугу.']::text[], array['1 міні-гра = 1 очко']::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('grocery', 'Розвізник продуктів', true, 2, 0, array['2 рівень']::text[], '{}'::text[], array['Телефон - GPS - Робота - Розвізник продуктів']::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('garbage', 'Сміттяр', true, 1, 1, array['1 рівень персонажа', 'робота доступна всім']::text[], array['Можливість працювати у бригаді (4 чоловіка з водієм).']::text[], array['Телефон - GPS - Робота - Сміттяр']::text[], array['1 рівень - початковий, транспорт "Trashmaster".', '2 рівень - 200 очок, надбавка від n$ до n$.', '3 рівень - 600 очок, надбавка від n$ до n$, транспорт - "Brute Refuser".', '4 рівень - 2000 очок, надбавка від n$ до n$.', '5 рівень - 5000 очок, надбавка від n$ до n$.']::text[], array['1 завантажений пакет сміття = 1 очко']::text[], '{}'::text[], array['Відбуксуйте автомобіль щоб поновити кількість палива та полагодити його.']::text[], 'Влаштовуємось на роботу та перевдягаємось. Беремо сміттєвоз та вирушаємо на відзначену на карті мітку. Забираємо сміття з контейнерів та завантажуємо в сміттєвоз. Після завантаження 25 пакетів сміття - їдемо на розвантаження, мітка поставиться автоматично.
Можливість працювати у бригаді 2 - 4 чоловіка з водієм.
Для колективної роботи необхідно запросити гравця до бригади Е - Робота - Запросити до бригади.', 'Залежить від відстані, від контейнера - до контейнера.', true),
  ('taxi', 'Таксі', true, 2, 2, array['2 рівень']::text[], '{}'::text[], array['Телефон - GPS - Роботи - Таксі.', 'Для влаштування потрібно мати 2 рівень персонажа. Підійдіть до NPC "Блейз Моран", поговоріть "Е" та натисніть кнопку "Влаштуватися".']::text[], array['1 рівень - робоче авто "BF Octava Uklon"', '2 рівень - можливість зареєструвати власне авто в віділку LSPD.']::text[], array['1 виклик = 1 очко']::text[], '{}'::text[], array['При продажі чи обміні авто ліцензія не зберігається.', 'При перевезенні реальних гравців, Ви отримуєте лише 50% від зазначеної вартості за 1 км.']::text[], 'Для оренди авто станьте на мітку біля NPC натисніть клавішу "Е". У вікні, що з''явилося, обераєте авто для роботи, колір та час на скільки ви хочете орендувати робоче авто. Натискайте "Орендувати", вкажіть вартість проїзду від 1 до 2.000$. Ціну завжди можна змінити, затиснувши клавішу "G" і обрати пункт "Ціна Проїзду". Для роботи натискаємо клавішу "J" та обираємо замовлення.', '', true),
  ('junk', 'Шукач мотлоху', true, 1, 0, array['1 рівень']::text[], array['В смітниках Ви можете знайти радіодеталі (Транзистор, Діод, Мідний дріт, Зарядний пристрій, Пластина), котрі потрібні для крафту Електросхеми, за допомогою якої Ви можете взломати банкомат та забрати з нього готівку.']::text[], array['Телефон - GPS - Заробіток - Скупник мотлоху (Для продажу мотлоху)', 'Сміттєві баки']::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('treasure', 'Шукач скарбів', true, 1, 2, array['1 рівень', 'Наявність металошукача (можна придбати в будь-якому магазині 24/7)', 'Наявність лопатки (можна придбати в будь-якому магазині 24/7)']::text[], '{}'::text[], '{}'::text[], array['Дані уточнюються.']::text[], array['1 рівень - початковий.', '2 рівень - 700 очок.', '3 рівень - 1300 очок.', '4 рівень - 2500 очок.', '5 рівень - *n* очок.']::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('carthief', 'Автовикрадач', false, 5, 3, array['5 рівень персонажа', 'бути учасником банди, мафії або байкерів']::text[], '{}'::text[], array['Телефон - GPS - Робота - Автовикрадач']::text[], array['1 рівень - початковий.', '2 рівень - 300 очок.', '3 рівень - 800 очок, після успішного викрадення ТЗ - наступний виклик власного ТЗ до себе знижка 50%.', '4 рівень - 2000 очок, після успішного викрадення ТЗ - наступний виклик власного ТЗ до себе знижка 50%.', '5 рівень - 5000 очок, після успішного викрадення ТЗ - наступний виклик до себе знижка 100%, набуття пасивної навички "Взлом будь якого авто".', 'Детальніше про навичку - "Поради".', 'Чим вище рівень навички - тим вище шанс на більш елітну автівку.']::text[], array['1 викрадене авто = 1 очко']::text[], '{}'::text[], array['Придбайте будинок біля автовикрадача, щоб після доставки перезаходити на сервер і не викликати автомобіль, або ж прокачайте Механіка до 4 рівня і викликайте авто безкоштовно.', 'При набутті навички "Взлом будь якого авто" на 5 рівні роботи, Ви маєте бути влаштовані Автовикрадачем, для того, щоб навичка була активною.']::text[], 'Влаштовуємось на роботу. Беремо замовлення на викрадення і прямуємо на відзначену на мапі зону, в котрій потрібно буде знайти потрібне авто (назва авто відображається при взятті замовлення). Коли ви знайдете потрібне авто і спробуєте в нього сісти - почнеться міні-гра в котрій потрібно буде запам''ятати правильну послідовність взлому. Після завершення взлому - авто потрібно доставити на відмічену точку. Будьте обережні, адже під час викрадення авто - рівень розшуку буде підвищений і знижений коли авто буде доставлено.', 'Залежить від відстані, від однієї мітки - до іншої.', true),
  ('zakladchyk', 'Закладчик', false, 2, 1, array['2 рівень', 'Бути членом мафії або банди']::text[], '{}'::text[], array['Будинок мафії/фракції']::text[], array['1 рівень - початковий.', '2 рівень - 300 очок, надбавка до 200$.', '3 рівень - 800 очок, надбавка до 400$ та 15% шанс знайти від 1000$ до 2000$ на місці закладки.', '4 рівень - 3500 очок, надбавка до 600$.', '5 рівень - 6500 очок, +5% шанс знайти 7500$ на місці закладки.']::text[], array['1 закладка = 1 очко']::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('zbroyar', 'Зброяр', false, 2, 0, array['2 рівень', 'Бути учасником банди, мафії або байкерів']::text[], '{}'::text[], array['Місце закупівлі комплектуючих', 'Місце переробки комплектуючих', 'Місце обміну на готові комплектуючі', 'Бандитський притон']::text[], array['1 рівень - початковий, купуєте 10 комплектуючих і перероблюєте в 500 матеріалів.', '2 рівень - 500 очок, купуєте 15 комплектуючих і перероблюєте в 750 матеріалів, знижка 10% на крафт зброї.', '3 рівень - 1500 очок, купуєте 20 комплектуючих і перероблюєте в 1000 матеріалів, знижка 20% на крафт зброї.', '4 рівень - 4000 очок, купуєте 25 комплектуючих і перероблюєте в 1250 матеріалів, знижка 30% на крафт зброї.', '5 рівень - 8000 очок, купуєте 30 комплектуючих і перероблюєте в 1500 матеріалів, знижка 50% на крафт зброї.']::text[], array['1 крафт матеріалів = 1 очко', '1 крафт зброї/бронежилету = 1 очко']::text[], '{}'::text[], '{}'::text[], '', '', false),
  ('burglar', 'Крадій-домушник', false, 5, 2, array['5 рівень персонажа', 'бути учасником банди, мафії або байкерів']::text[], array['Можливість працювати у бригаді (2 чоловіка з водієм).']::text[], array['Телефон - GPS - Робота - Крадій-домушник']::text[], array['1 рівень - початковий, транспорт - "Declasse Burrito".', '2 рівень - 200 очок, надбавка від n$ до n$, доступний транспорт "Karin Kuruma".', '3 рівень - 600 очок, надбавка від n$ до n$.', '4 рівень - 1500 очок, надбавка від n$ до n$, доступний броньований транспорт "Karin Kuruma (броня)".', '5 рівень - 3800 очок, надбавка від n$ до n$, набуття пасивної навички "При пограбуванні гравців - вкрадені кошти подвоюються".']::text[], array['Пограбування 1 будинку = 1 очко']::text[], '{}'::text[], '{}'::text[], 'Влаштовуємось на роботу. Беремо автівку та вирушаємо на відзначену на мапі мітку. По прибуттю до будинку - заходимо до нього і виносимо помічені предмети та грузимо їх у автомобіль. Якщо в будинку, який випав для пограбування є сейф - його можливо зламати. Для цього потрібна відмичка а також пройти міні-гру для відчинення замка сейфа. Направляємось по вказаному маршруту для збуту викрадених предметів. Під час пограбування у Вас підвищиться рівень пошуку, він буде знижений після збуту предметів.
Можливість працювати у бригаді (2 чоловіка з водієм).', 'Залежить від відстані, від однієї мітки - до іншої.', true),
  ('dealer', 'Наркодилер', false, 2, 2, array['2 рівень', 'Бути учасником банди, мафії або байкерів']::text[], '{}'::text[], array['Бандитський притон', 'Лабораторія']::text[], array['1 рівень - початковий, крафт 2 таблетки амфітаміну або 2 косяка.', '2 рівень - 500 очок, крафт 3 таблетки амфітаміну або 3 косяка.', '3 рівень - 1500 очок, крафт 4 таблетки амфітаміну або 4 косяка.', '4 рівень - 4000 очок, крафт 5 таблетки амфітаміну або 5 косяка.', '5 рівень - 6500 очок, крафт 6 таблетки амфітаміну або 6 косяка.']::text[], array['1 крафт таблетки/косяка = 1 очко']::text[], '{}'::text[], '{}'::text[], '', '', false)
on conflict (id) do nothing;
