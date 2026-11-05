-- Q-Hub 0059: мітки на мапі від гравців (specs/043 US5). Новий розділ довідника map_point: гравець пропонує нову мітку
-- (категорія, назва, опис, точка, скрін-доказ — приватно), публікують admin і moderator тією самою wiki_decide.
-- Правка й прибирання наявних міток — як і раніше, лише admin (map_points: admin write, 0015). Ліміти, заборони, черга,
-- «Мої правки», рейтинг — з 0057 без змін. Функції нижче — з 0057 з доданою гілкою map_point.

alter table public.wiki_proposals drop constraint if exists wiki_proposals_section_check;
alter table public.wiki_proposals add constraint wiki_proposals_section_check check (section in ('job', 'vehicle', 'map_point'));
alter table public.wiki_versions drop constraint if exists wiki_versions_section_check;
alter table public.wiki_versions add constraint wiki_versions_section_check check (section in ('job', 'vehicle', 'map_point'));

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
    else
      raise exception using errcode = 'QH003', message = 'Невідомий розділ довідника.';
    end if;
  end loop;
  if p_new then
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
    when 'map_point' then (select jsonb_build_object('category_id', m.category_id, 'name', m.name, 'note', m.note, 'x', m.x, 'y', m.y)
      from public.map_points m where m.id::text = p_target)
  end
$$;

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
  /* мітки мапи (US5): поки лише нові — правка й прибирання наявних міток лишаються за admin */
  if new.section = 'map_point' and new.kind <> 'new' then
    raise exception using errcode = 'QH003', message = 'Поки можна лише запропонувати нову мітку — змінити наявну може адмін.';
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
  elsif p_section = 'map_point' then
    if t is not null then raise exception using errcode = 'QH003', message = 'Наявну мітку змінює адмін.'; end if;
    insert into public.map_points (category_id, name, note, x, y, created_by)
      values (p_data ->> 'category_id', btrim(p_data ->> 'name'), coalesce(p_data ->> 'note', ''), (p_data ->> 'x')::double precision,
        (p_data ->> 'y')::double precision, p_author)
      returning id::text into t;
    ver := 1;
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

-- create or replace скидає права лише для нових функцій; ці — службові, з сайту не викликаються
revoke execute on function public.wiki_apply(text, text, jsonb, text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.wiki_snapshot(text, text) from public, anon, authenticated;
