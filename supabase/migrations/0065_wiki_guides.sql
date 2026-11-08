-- Q-Hub 0065: гайди від гравців (WIKI → Гайди). Гайди переїжджають з src/data/guides.ts у таблицю wiki_guides
-- (назва guides зайнята інструкцією «Як поставити мапу», 0035) і стають розділом довідника 'guide': гравці пропонують
-- новий гайд або правку чи прибирання наявного, публікують лише admin і moderator тією самою wiki_decide (принцип II).
-- • Текст гайду — блоки jsonb (p, h, list, tip, warn, table, links) — той самий формат, що в src/data/guides.ts;
--   перевіряє wiki_guide_blocks_ok (і check таблиці, і wiki_clean). Ті самі межі — у src/lib/guideBlocks.ts.
-- • Посилання в гайді — лише на сторінки сайту («/wiki/…»): без зовнішніх адрес не буде спаму й фішингу.
-- • Автор — created_by (хто запропонував новий гайд), видно ніком через wiki_contributors, як у робіт.
-- • Наявні 6 гайдів — вкінці файлу, on conflict do nothing: повтор міграції не затирає правок гравців.
-- Функції нижче — з 0057/0059/0060 з доданою гілкою guide. Залежить від 0057, 0059, 0060. Файл можна запускати повторно.
-- УВАГА: повторний запуск 0059 чи 0060 перепише wiki_clean/wiki_snapshot/wiki_apply без гайдів — після них запускай і цей файл.

-- ---------- блоки гайду ----------
create or replace function public.wiki_guide_blocks_ok(b jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare x jsonb; r jsonb; k text; n integer;
begin
  if b is null or jsonb_typeof(b) <> 'array' or jsonb_array_length(b) not between 1 and 80 or char_length(b::text) > 60000 then return false; end if;
  for x in select * from jsonb_array_elements(b) loop
    if jsonb_typeof(x) <> 'object' then return false; end if;
    k := x ->> 'k';
    if k in ('p', 'h', 'tip', 'warn') then
      if (x - 'k' - 'text') <> '{}'::jsonb or jsonb_typeof(x -> 'text') is distinct from 'string'
         or char_length(btrim(x ->> 'text')) not between 1 and (case when k = 'h' then 120 else 2000 end) then return false; end if;
    elsif k = 'list' then
      if (x - 'k' - 'items' - 'ordered') <> '{}'::jsonb or jsonb_typeof(x -> 'items') is distinct from 'array'
         or jsonb_array_length(x -> 'items') not between 1 and 40
         or (x ? 'ordered' and jsonb_typeof(x -> 'ordered') <> 'boolean')
         or exists (select 1 from jsonb_array_elements(x -> 'items') i where jsonb_typeof(i) <> 'string' or char_length(btrim(i #>> '{}')) not between 1 and 600) then
        return false;
      end if;
    elsif k = 'table' then
      if (x - 'k' - 'head' - 'rows') <> '{}'::jsonb or jsonb_typeof(x -> 'head') is distinct from 'array'
         or jsonb_typeof(x -> 'rows') is distinct from 'array' then return false; end if;
      n := jsonb_array_length(x -> 'head');
      if n not between 2 and 6 or jsonb_array_length(x -> 'rows') not between 1 and 60
         or exists (select 1 from jsonb_array_elements(x -> 'head') h where jsonb_typeof(h) <> 'string' or char_length(btrim(h #>> '{}')) not between 1 and 60) then
        return false;
      end if;
      for r in select * from jsonb_array_elements(x -> 'rows') loop
        if jsonb_typeof(r) <> 'array' or jsonb_array_length(r) <> n
           or exists (select 1 from jsonb_array_elements(r) c where jsonb_typeof(c) <> 'string' or char_length(c #>> '{}') > 300) then return false; end if;
      end loop;
    elsif k = 'links' then
      if (x - 'k' - 'items') <> '{}'::jsonb or jsonb_typeof(x -> 'items') is distinct from 'array'
         or jsonb_array_length(x -> 'items') not between 1 and 12
         or exists (select 1 from jsonb_array_elements(x -> 'items') l
           where jsonb_typeof(l) <> 'object' or (l - 'to' - 'label') <> '{}'::jsonb
              or jsonb_typeof(l -> 'to') is distinct from 'string' or (l ->> 'to') !~ '^/[A-Za-z0-9/_?=&%.,#~-]{0,200}$' or (l ->> 'to') like '//%'
              or jsonb_typeof(l -> 'label') is distinct from 'string' or char_length(btrim(l ->> 'label')) not between 1 and 60) then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end $$;

-- іконки гайдів — з набору сайту (src/components/Icon.tsx); той самий список — GUIDE_ICONS у src/lib/guideBlocks.ts
create or replace function public.wiki_guide_icons() returns text[]
language sql immutable set search_path = '' as $$
  select array['book', 'star', 'shield', 'user', 'trophy', 'spark', 'box', 'jobs', 'car', 'moto', 'plane', 'boat', 'map', 'pin',
               'coin', 'chart', 'clock', 'bolt', 'fuel', 'tag', 'buyer', 'home', 'help', 'camera', 'layers', 'speed']
$$;

-- ---------- гайди ----------
create table if not exists public.wiki_guides (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 3 and 80),
  summary text not null default '' check (char_length(summary) <= 300),
  icon text not null default 'book' check (icon = any (public.wiki_guide_icons())),
  blocks jsonb not null check (public.wiki_guide_blocks_ok(blocks)),
  sort integer not null default 1000,
  hidden boolean not null default false,
  version bigint not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wiki_guides_name_lower on public.wiki_guides (lower(btrim(name)));

alter table public.wiki_guides enable row level security;
drop policy if exists "wiki guides: read" on public.wiki_guides;
drop policy if exists "wiki guides: admin write" on public.wiki_guides;
create policy "wiki guides: read" on public.wiki_guides for select using (not hidden or public.is_wiki_mod());
-- напряму пише лише admin (порядок у списку — sort); гравці й модератори — пропозиціями (принцип II)
create policy "wiki guides: admin write" on public.wiki_guides for all using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.wiki_guides from anon;
grant select on public.wiki_guides to anon;
grant select, insert, update, delete on public.wiki_guides to authenticated;

-- ---------- розділ 'guide' у пропозиціях і історії ----------
alter table public.wiki_proposals drop constraint if exists wiki_proposals_section_check;
alter table public.wiki_proposals add constraint wiki_proposals_section_check check (section in ('job', 'vehicle', 'map_point', 'guide'));
alter table public.wiki_versions drop constraint if exists wiki_versions_section_check;
alter table public.wiki_versions add constraint wiki_versions_section_check check (section in ('job', 'vehicle', 'map_point', 'guide'));

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
    elsif p_section = 'map_point' then
      if not k = any (array['category_id', 'name', 'note', 'x', 'y']) then perform public.wiki_bad(k, 'це поле не пропонується');
      elsif k = 'category_id' then
        if jsonb_typeof(v) <> 'string' or not exists (select 1 from public.map_categories c where c.id = v #>> '{}') then
          perform public.wiki_bad('Категорія', 'вибери категорію зі списку мапи');
        end if;
      elsif k = 'name' then
        if jsonb_typeof(v) <> 'string' or char_length(btrim(v #>> '{}')) not between 1 and 160 then perform public.wiki_bad('Назва', 'від 1 до 160 символів'); end if;
      elsif k = 'note' then
        if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 600 then perform public.wiki_bad('Опис', 'до 600 символів'); end if;
      elsif k in ('x', 'y') then
        if jsonb_typeof(v) <> 'number' then perform public.wiki_bad('Точка', 'координати числами'); end if;
        n := (v #>> '{}')::numeric;
        if (k = 'x' and n not between -6000 and 6800) or (k = 'y' and n not between -4400 and 8500) then
          perform public.wiki_bad('Точка', 'поза мапою штату');
        end if;
      end if;
    elsif p_section = 'guide' then
      if k = 'id' and p_new then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[a-z0-9-]{2,40}$' then perform public.wiki_bad('адреса', 'лише латинські літери, цифри й дефіс, 2–40'); end if;
      elsif not k = any (array['name', 'summary', 'icon', 'blocks']) then perform public.wiki_bad(k, 'це поле не пропонується');
      elsif k = 'name' then
        if jsonb_typeof(v) <> 'string' or char_length(btrim(v #>> '{}')) not between 3 and 80 then perform public.wiki_bad('Назва', 'від 3 до 80 символів'); end if;
      elsif k = 'summary' then
        if jsonb_typeof(v) <> 'string' or char_length(btrim(v #>> '{}')) not between 1 and 300 then perform public.wiki_bad('Коротко', 'від 1 до 300 символів'); end if;
      elsif k = 'icon' then
        if jsonb_typeof(v) <> 'string' or not (v #>> '{}') = any (public.wiki_guide_icons()) then perform public.wiki_bad('Іконка', 'вибери зі списку'); end if;
      elsif k = 'blocks' then
        if not public.wiki_guide_blocks_ok(v) then
          perform public.wiki_bad('Текст гайду', 'від 1 до 80 блоків без порожніх полів; таблиця — 2–6 стовпців; посилання — лише на сторінки сайту');
        end if;
      end if;
    else
      raise exception using errcode = 'QH003', message = 'Невідомий розділ довідника.';
    end if;
  end loop;
  if p_new then
    if p_section = 'guide' and not (p_data ? 'id' and p_data ? 'summary' and p_data ? 'blocks') then
      perform public.wiki_bad('Гайд', 'потрібні адреса, короткий опис і текст');
    end if;
    if not p_data ? 'name' then perform public.wiki_bad('Назва', 'обов''язкова для нової сторінки'); end if;
    if p_section = 'job' and not p_data ? 'id' then perform public.wiki_bad('адреса', 'обов''язкова для нової роботи'); end if;
    if p_section = 'vehicle' and not p_data ? 'kind' then perform public.wiki_bad('Тип', 'обов''язковий для нового транспорту'); end if;
    if p_section = 'map_point' and not (p_data ? 'category_id' and p_data ? 'x' and p_data ? 'y') then
      perform public.wiki_bad('Мітка', 'потрібні категорія й точка на мапі');
    end if;
  end if;
  return p_data;
end $$;

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
    when 'map_point' then (select jsonb_build_object('category_id', m.category_id, 'name', m.name, 'note', m.note, 'x', m.x, 'y', m.y, 'hidden', m.hidden)
      from public.map_points m where m.id::text = p_target)
    when 'guide' then (select jsonb_build_object('id', g.id, 'name', g.name, 'summary', g.summary, 'icon', g.icon, 'blocks', g.blocks, 'hidden', g.hidden)
      from public.wiki_guides g where g.id = p_target)
  end
$$;

create or replace function public.wiki_version_of(p_section text, p_target text) returns bigint
language sql stable security definer set search_path = '' as $$
  select case p_section
    when 'job' then (select version from public.jobs where id = p_target)
    when 'vehicle' then (select version from public.vehicles where id::text = p_target)
    when 'map_point' then (select version from public.map_points where id::text = p_target)
    when 'guide' then (select version from public.wiki_guides where id = p_target)
  end
$$;

create or replace function public.wiki_apply(p_section text, p_target text, p_data jsonb, p_kind text, p_proposal uuid,
  p_author uuid, p_note text) returns table (target_id text, version_no bigint, version_id bigint)
language plpgsql security definer set search_path = '' as $$
declare j public.jobs; v public.vehicles; g public.wiki_guides; t text := p_target; ver bigint; vid bigint;
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
  elsif p_section = 'map_point' then
    if t is null then
      insert into public.map_points (category_id, name, note, x, y, created_by)
        values (p_data ->> 'category_id', btrim(p_data ->> 'name'), coalesce(p_data ->> 'note', ''), (p_data ->> 'x')::double precision,
          (p_data ->> 'y')::double precision, p_author)
        returning id::text into t;
      ver := 1;
    else
      /* наявна мітка: лише сховати чи повернути («Точка застаріла», відкат) — решту полів змінює admin на мапі */
      if (p_data - 'hidden') <> '{}'::jsonb and p_kind not in ('revert') then
        raise exception using errcode = 'QH003', message = 'Наявну мітку змінює адмін.';
      end if;
      if not exists (select 1 from public.wiki_versions w where w.section = 'map_point' and w.target_id = t) then
        insert into public.wiki_versions (section, target_id, version_no, data, kind)
          select 'map_point', t, mp.version, public.wiki_snapshot('map_point', t), 'seed' from public.map_points mp where mp.id::text = t;
      end if;
      update public.map_points set hidden = coalesce((p_data ->> 'hidden')::boolean, hidden), version = version + 1
        where id::text = t returning version into ver;
      if ver is null then raise exception using errcode = 'QH014', message = 'Такої мітки вже немає.'; end if;
    end if;
  elsif p_section = 'guide' then
    if t is null then
      insert into public.wiki_guides (id, name, summary, icon, blocks, created_by, updated_by)
        values (p_data ->> 'id', btrim(p_data ->> 'name'), btrim(coalesce(p_data ->> 'summary', '')), coalesce(p_data ->> 'icon', 'book'),
          p_data -> 'blocks', p_author, p_author)
        returning id into t;
    elsif not exists (select 1 from public.wiki_versions w where w.section = 'guide' and w.target_id = t) then
      insert into public.wiki_versions (section, target_id, version_no, data, kind)
        select 'guide', t, gg.version, public.wiki_snapshot('guide', t), 'seed' from public.wiki_guides gg where gg.id = t;
    end if;
    select * into g from public.wiki_guides where id = t for update;
    g := jsonb_populate_record(g, p_data - 'id');
    update public.wiki_guides set name = btrim(g.name), summary = btrim(g.summary), icon = g.icon, blocks = g.blocks, hidden = g.hidden,
      version = case when p_target is null then 1 else version + 1 end,
      updated_by = coalesce(p_author, updated_by), updated_at = now()
      where id = t returning version into ver;
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
    if p.kind = 'new' and p.section = 'guide' and exists (select 1 from public.wiki_guides where id = d ->> 'id') then
      raise exception using errcode = 'QH003', message = 'Гайд з такою адресою вже є — зміни адресу.';
    end if;
    /* назва унікальна (без урахування регістру) — людським текстом, а не помилкою індексу */
    if d ? 'name' and (
      (p.section = 'job' and exists (select 1 from public.jobs where lower(name) = lower(btrim(d ->> 'name')) and id is distinct from p.target_id))
      or (p.section = 'vehicle' and exists (select 1 from public.vehicles where lower(name) = lower(btrim(d ->> 'name')) and id::text is distinct from p.target_id))
      or (p.section = 'guide' and exists (select 1 from public.wiki_guides where lower(btrim(name)) = lower(btrim(d ->> 'name')) and id is distinct from p.target_id))) then
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

-- create or replace скидає права лише для нових функцій — тут повторюємо, як у 0057/0060
revoke execute on function public.wiki_apply(text, text, jsonb, text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.wiki_snapshot(text, text) from public, anon, authenticated;
revoke execute on function public.wiki_version_of(text, text) from public, anon, authenticated;
revoke execute on function public.wiki_decide(uuid, text, jsonb, text, boolean) from public, anon;
grant execute on function public.wiki_decide(uuid, text, jsonb, text, boolean) to authenticated;

-- ---------- наявні гайди з src/data/guides.ts (сім'я CORE, листопад 2026); повтор нічого не затирає ----------
insert into public.wiki_guides (id, name, summary, icon, blocks, sort) values
  ('novachkam', 'Новачку: перші кроки', 'Промокод, перші квести, з якої роботи почати, що купувати першим і чого уникати.', 'star', '[{"k":"p","text":"Короткий план на перші дні на QuantRP: як швидко отримати стартові гроші, де заробляти й куди рухатися далі."},{"k":"h","text":"Промокод і перші квести"},{"k":"list","ordered":true,"items":["Щойно отримаєте 2 рівень — відкрийте телефон і введіть промокод QHUB: 50 000$, +1 ігровий рівень і Platinum VIP на 7 днів.","Platinum VIP дає, серед іншого, +4 000$ кожен PayDay і пасивний режим авто.","На точці появи візьміть скутер — до 5 рівня він безкоштовний.","Пройдіть базові квести з меню: документи в Мерії, права в автошколі (хоча б на легкове авто), SIM-карта в магазині 24/7. Так найшвидше розберетеся з сервером."]},{"k":"tip","text":"Біля точки появи часто стоять гравці, які виконують сімейний квест «Допомога громадянам» і роздають новачкам по 1 000$. Постійте поруч — назбираєте перші кишенькові."},{"k":"h","text":"З якої роботи почати"},{"k":"list","items":["Фермер (апельсини) — одна з найприбутковіших на старті, якщо продавати фрукти гравцям, а не скупнику.","Шукач скарбів і Рибак — доступні з 1 рівня, потрібні лише інструменти з магазину 24/7.","Інкасатор — з 4 рівня; можна працювати в бригаді, а 3 рівень навички прибирає комісію на перекази.","Газонокосильник — простий, але вигідний лише тим, хто в банді (випадають косяки)."]},{"k":"links","items":[{"to":"/wiki/roboty?job=farmer","label":"Фермер"},{"to":"/wiki/roboty?job=treasure","label":"Шукач скарбів"},{"to":"/wiki/roboty?job=fisher","label":"Рибак"},{"to":"/wiki/roboty?job=inkasator","label":"Інкасатор"},{"to":"/wiki/roboty","label":"Усі роботи"}]},{"k":"h","text":"Сім''я, Battle Pass і щоденні завдання"},{"k":"list","items":["Вступайте в сім''ю якомога раніше: сімейний автопарк і частка за сімейні квести (по 50 000–100 000$ за легкі).","Сім''ї бувають «фарм» (квести й заробіток) і «крайм» (війни за території) — обирайте за стилем гри.","Battle Pass займає 3–5 годин на день, але з нього падають одяг, кейси з авто й анімації, які можна продати.","Щоденні завдання легші й дають гроші та донат-коїни — за місяць набирається чимало без вкладень."]},{"k":"h","text":"Що купувати першим"},{"k":"p","text":"Спершу авто, потім житло: транспорт потрібен для робіт і квестів, а будинок на старті все одно буде скромним — квартиру чи середній клас можна взяти пізніше."},{"k":"h","text":"Коли освоїтеся"},{"k":"list","items":["Прочитайте правила сервера на форумі й вступайте у фракцію: держструктури (LSPD, FIB, EMS, National Guard, News) або крайм (банди й мафії).","У бандах заробляють нелегальними роботами: автовикрадач, домушник, зброяр.","Перекупство (купити дешевше — продати дорожче) — швидкий шлях до грошей, але не на старті: без знання цін легко купити те, що потім не продасться."]},{"k":"warn","text":"Казино — не спосіб заробітку. Навіть ті, хто вигравав сотні мільйонів, здебільшого врешті програвали все."}]'::jsonb, 10),
  ('banda-mafiya', 'Вступ у банду чи мафію', 'Хто приймає, як пройти співбесіду без пасток, ранги й що відкривається.', 'shield', '[{"k":"h","text":"Куди можна вступити"},{"k":"list","items":["Банди: Marabunta, Vagos, Ballas, Grove Street, Bikers.","Мафії: Odessa, La Cosa Nostra, Yakuza, Колумбійський картель.","Потрібен щонайменше 3 ігровий рівень."]},{"k":"h","text":"Співбесіда"},{"k":"list","items":["Підігравайте легенді: банди часто відіграють легальне прикриття (наприклад, будівельну компанію) — не говоріть відкрито про кримінал.","Будьте готові до вступного внеску (буває близько 20 000$).","Перевірка термінів — найважливіша частина. Питають в OOC-чат (/b) — відповідайте туди ж справжнім значенням правил (ДМ — вбивство без причини, СК — спавн-кіл). Питають голосом (IC) — розшифровуйте по РП (ДМ — «Дядя Міша», СК — «Скільки коштує»).","Можуть дати РП-завдання (протерти диски, перевірити багажник) — використовуйте /me, /do, /try.","«Котра година?» — перевірка на відігрування: спершу дістаньте телефон або подивіться на годинник анімацією, і лише потім відповідайте."]},{"k":"h","text":"Ранги"},{"k":"list","items":["Після прийняття й додавання у фракційний Discord — 1 ранг. Щоб перейти на 2, купіть фракційний дрес-код у магазині банди.","Основні кримінальні події (ВЗА, ВЗХ) відкриваються з 4–5 рангу — залежить від правил банди.","Досвідчені можуть пропустити початкові завдання: передати 300 000$ рекруту, скласти іспит з правил і пройти посвяту."]},{"k":"tip","text":"Якщо в сім''ї є затверджена біографія під конкретну банду, вступ «по зв''язках» значно швидший і дешевший."},{"k":"h","text":"Як заробляти в банді"},{"k":"links","items":[{"to":"/wiki/roboty?job=carthief","label":"Автовикрадач"},{"to":"/wiki/roboty?job=zakladchyk","label":"Закладчик"},{"to":"/wiki/roboty?job=burglar","label":"Крадій-домушник"},{"to":"/wiki/roboty?job=zbroyar","label":"Зброяр"}]}]'::jsonb, 20),
  ('simyi', 'Сім''ї: створення і можливості', 'Скільки коштує створити сім''ю, що в меню, війни за території й світові боси.', 'user', '[{"k":"h","text":"Як створити сім''ю"},{"k":"p","text":"Сім''ю створюють у Мерії (NPC у будівлі уряду)."},{"k":"table","head":["Варіант","Гроші","Будинок"],"rows":[["Без війн за території","5 000 000$ готівкою","щонайменше 5 гаражних місць (на ринку ≈15–20 млн$)"],["З війнами сімей","7 500 000$ готівкою","10 гаражних місць"]]},{"k":"tip","text":"Вигідніше почати за 5 млн, а доступ до війн докупити пізніше — коли в сім''ї будуть люди, які добре стріляють."},{"k":"h","text":"Меню «Сім''я» в телефоні"},{"k":"list","items":["Головна — репутація, авторитет, сейф, місце в топі.","Учасники — хто онлайн, ранги, звільнення.","Налаштування — ранги з доступами (наприклад, 1 ранг — лише холодильник, 5 ранг — сейф і дороге авто).","Транспорт — хто з якого рангу бере які авто з гаража.","Нерухомість — сімейний дім і податки (сплачуються в NPC Інкасаторів).","Покращення — своя мітка будинку, логотип, більший гараж, союзники на мапі; найдорожче — сімейний одяг (25 рівень сім''ї і 100 000 000$).","Історія — хто що взяв зі складу й сейфа; чорний список."]},{"k":"h","text":"Війни за території"},{"k":"p","text":"З доступом до війн сім''я може відвойовувати території в інших (капти). Територія дає великий щоденний пасивний дохід і авторитет, але більшість із них тримають давні сильні сім''ї — потрібні добрі стрільці й знання правил перестрілок."},{"k":"h","text":"Світові боси"},{"k":"table","head":["Бос","Коли й де","Нагорода"],"rows":[["Джаггернаут","щосуботи о 20:00, «Вітряки»","15–20 млн$ у сейф; 5% шанс на скін броні Джаггернаута (+10% захисту від куль)"],["Чорна Борода","щонеділі о 20:00, на кораблі","15–20 млн$ у сейф; предмет, що збільшує шкоду зброї"]]},{"k":"links","items":[{"to":"/wiki/gaidy/simeyni-kvesty","label":"Сімейні квести"}]}]'::jsonb, 30),
  ('simeyni-kvesty', 'Сімейні квести', 'Усі квести сім''ї в одній таблиці: що зробити, нагорода, скільки часу й хитрощі.', 'trophy', '[{"k":"p","text":"Квест запускає лідер або заступник (або гравець із таким правом). Нагорода йде в сейф сім''ї разом із досвідом і репутацією; як ділити гроші з виконавцем — вирішує сім''я (часто навпіл)."},{"k":"table","head":["Квест","Що зробити","Нагорода","Час","Хитрощі"],"rows":[["Допомога громадянам","Продати 100 хот-догів і дати по 1 000$ 50 різним гравцям 1–5 рівня","1 000 000$","12 год на виконання; ≈2–4 год роботи","У фургон влазить 10 хот-догів. Продавати біля Казино, Інкасаторів, Лікарні й спавнів транспорту; можна стояти в AFK. Новачків шукати на початкових роботах і точках появи ввечері чи у вихідні. Удвох-утрьох — у рази швидше."],["Лісові трофеї","Зібрати 500 печериць і 400 глив і продати скупнику","750 000$","12 год; ≈3–5 год","Візьміть дві лопати й вільне місце (або багажник поруч). Суп із цап-гриба: годину кожен гриб рахується за два. Глива — з 2 рівня грибника. У скупника ліміт — частину грибів продає друг. Найкраще вночі чи рано вранці."],["Мисливський сезон","Здати скупнику 250 шкур","500 000$, патрони на склад","—","Не обов''язково полювати: дешеві шкури можна скупити в гравців. Через ліміт скупника частину здає напарник."],["Рибний день","Наловити всією сім''єю 2 000 риб","гроші в сейф","≈1–1,5 год з ≈10 гравцями","Потрібна координація й багато людей одночасно."],["Товарний вибух","Розвезти вантажі","гроші в сейф","—","Потрібен місткий транспорт: фургони чи пікапи (Ford Raptor)."],["Суботник","Зібрати сміття на 5 територіях і здати на звалище","гроші в сейф","—",""],["Нелегальне завдання","Викрасти 20 авто, пограбувати будинки на 150 000$ і гравців на трасі на 100 000$, обчистити магазини 24/7 і амуніції","гроші в сейф","≈3–4 год","Усі учасники мають бути в кримінальних фракціях. Найдовший і найскладніший квест."]]},{"k":"tip","text":"«Допомога громадянам» — найлегший квест: його виконують навіть утрьох, а частина нагороди часто йде виконавцю."}]'::jsonb, 40),
  ('khytroshchi', 'Корисні хитрощі', 'Дрібниці, які економлять гроші й час: ключі, гараж, перекази, Battle Pass, безпека.', 'spark', '[{"k":"h","text":"Гроші й майно"},{"k":"list","items":["Ціни на авто, будинки й речі дивіться на торговому майданчику в Discord. Знайшли будинок — вбийте його номер у пошук каналу й подивіться, за скільки його продавали раніше.","Ціни в системних скупників (риба, метал, мотлох тощо) змінюються — стежте за ними, перш ніж здавати.","Прокачайте Інкасатора до 3 рівня — перекази й обмін грошима з гравцями без комісії, навіть на великі суми.","Прокачайте Механіка до 4 рівня — виклик власного авто стає дешевшим назавжди.","Купіть «Зв''язку ключів» у магазині 24/7 (≈15 000$) — усі ключі від авто в одному слоті інвентаря."]},{"k":"table","head":["Розширення гаража","Для будинків","Ціна"],"rows":[["+2 місця","держ. вартістю від 100 000$","500 000$"],["з 2 до 3 місць","держ. вартістю від 1 000 000$","550 000$"]]},{"k":"h","text":"Battle Pass і завдання"},{"k":"list","items":["Випали надто важкі щоденні завдання — зайдіть на іншого персонажа: там вони інші, а виконані зараховуються в загальний прогрес акаунта.","«Здати кров» можна з усіх трьох персонажів і отримати нагороду тричі.","Для завдань із дріфту найкраще підходить Hoonicorn.","Мікросхеми (для Battle Pass і злому банкоматів) збирають із мотлоху в NPC «Скупник хламу»."]},{"k":"h","text":"Безпека"},{"k":"list","items":["Бандити можуть грабувати не лише на трасах за містом, а й у Гетто в Лос-Сантосі — будьте обережні в цих районах.","Увімкніть подвійну автентифікацію (2FA) і Telegram-бота: туди приходять сповіщення про податки й продаж майна на маркеті."]}]'::jsonb, 50),
  ('kompaniya-dalekobiynykiv', 'Власна компанія далекобійників', 'Як відкрити фірму, які фури брати, навички компанії й поради водіям.', 'box', '[{"k":"p","text":"Звичайна робота далекобійника лишилась без змін — компанія це окрема система з власним офісом, фурами й найманими водіями."},{"k":"h","text":"Як відкрити"},{"k":"list","ordered":true,"items":["У Бізнес-центрі купіть офіс у NPC — 1 000 000$.","Ліфтом до іншого NPC — реєстрація фірми, 4 000 000$. Разом на старт — 5 млн$.","У NPC-помічника в офісі — назва, логотип, колір; покращення (холодильник, сейф, кухня) та інший інтер''єр — за донат-коїни."]},{"k":"h","text":"Фури"},{"k":"list","items":["Купуються в окремому магазині для компаній; тюнінгують їх в окремому автосервісі.","Стартова фура — 2 000 000$, до 130 км/год і вантажі до 3 тонн («легкі»). З 2 рівня — фура до 170 км/год; топові возять «важкі» вантажі, які платять найбільше.","На старті доведеться їздити базовими бусами; з 5 рівня фірми — дві середні фури; з 7 рівня — тягачі «ТБшка», яких вистачить до 11–13 рівня.","Фуру з гаража можна продати за 50% держ. вартості."]},{"k":"h","text":"Планшет фірми"},{"k":"list","items":["Головна — заробіток за день/тиждень/місяць, рейси, «Новина дня» для водіїв (наприклад, премія за кожні 10 рейсів).","Навички фірми — відкриваються за «діаманти», які дають за рівні фірми: більший гараж, більше водіїв, далекобійні маршрути, нові вантажі (деревина, авто, паливо, будматеріали), небезпечні маршрути (дають «черепки» для режиму «Конвой»), дешевший виклик фури, більший бак.","Водії — активність, кілометраж і дохід кожного, премії, попередження, звільнення.","Замовлення — сортування за типом, відстанню, ціною й тоннажем; взяти можна лише вантаж, який витримає ваша фура.","Управління — ранги й доступи, історія, податки фірми, чорний список."]},{"k":"h","text":"Поради водіям"},{"k":"list","items":["Platinum VIP майже обов''язковий: пасивний режим рятує від таранів, а пошкоджений вантаж зменшує або скасовує оплату.","Возіть ремкомплекти й 3 каністри по 100 л — фури швидко спалюють паливо.","Потрібен рівень фірми — беріть короткі рейси; потрібні гроші — найвигідніші далекі, що підходять під тоннаж.","За легкий рейс на старті — від ≈3 000$ на рахунок фірми."]},{"k":"links","items":[{"to":"/wiki/roboty?job=trucker","label":"Робота «Далекобійник»"}]}]'::jsonb, 60)
on conflict (id) do nothing;
