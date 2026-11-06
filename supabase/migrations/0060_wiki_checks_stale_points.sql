-- Q-Hub 0060 (specs/043 US6 + рішення власника 2026-11-05):
-- • «Актуально» на картках: гравець підтверджує, що дані правильні — один голос з акаунта на версію картки (wiki_check),
--   лічильник — wiki_check_counts. «Може бути застарілим» сайт показує сам за wiki_settings.stale_days.
-- • «Точка застаріла»: пропозиція прибрати мітку мапи (map_point, kind = hide) з причиною; модератор приймає —
--   мітка ховається (hidden), а не видаляється, і її можна повернути (wiki_unhide / wiki_revert). Правку полів мітки й далі робить admin.

-- ---------- мітки: сховано й версія ----------
alter table public.map_points
  add column if not exists hidden boolean not null default false,
  add column if not exists version bigint not null default 1;
drop policy if exists "map_points: read published" on public.map_points;
create policy "map_points: read published" on public.map_points for select
  using ((batch_id is null or public.is_admin() or public.map_batch_published(batch_id)) and (not hidden or public.is_wiki_mod()));

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
  end
$$;

create or replace function public.wiki_version_of(p_section text, p_target text) returns bigint
language sql stable security definer set search_path = '' as $$
  select case p_section
    when 'job' then (select version from public.jobs where id = p_target)
    when 'vehicle' then (select version from public.vehicles where id::text = p_target)
    when 'map_point' then (select version from public.map_points where id::text = p_target)
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
  /* мітки мапи: нова (US5) або «Точка застаріла» — прибрати (0060); правку наявної мітки робить admin */
  if new.section = 'map_point' and new.kind = 'edit' then
    raise exception using errcode = 'QH003', message = 'Змінити наявну мітку може адмін — можна запропонувати нову або повідомити, що точка застаріла.';
  end if;
  if new.section = 'map_point' and new.kind = 'hide' and btrim(new.source_note) = '' then
    raise exception using errcode = 'QH003', message = 'Напиши, чому точка застаріла.';
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

revoke execute on function public.wiki_apply(text, text, jsonb, text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.wiki_snapshot(text, text) from public, anon, authenticated;
revoke execute on function public.wiki_version_of(text, text) from public, anon, authenticated;

-- ---------- «Актуально» ----------
-- голос — лише за поточну версію картки, лише від себе; повтор нічого не додає
create or replace function public.wiki_check(p_section text, p_target text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if auth.uid() is null then raise exception using errcode = 'QH010', message = 'Увійди через Discord, щоб підтвердити.'; end if;
  if p_section not in ('job', 'vehicle') then raise exception using errcode = 'QH003', message = 'Цю сторінку не підтверджують.'; end if;
  v := public.wiki_version_of(p_section, p_target);
  if v is null then raise exception using errcode = 'QH014', message = 'Такої сторінки немає.'; end if;
  insert into public.wiki_checks (section, target_id, version_no, user_id) values (p_section, p_target, v, auth.uid())
    on conflict do nothing;
  return (select jsonb_build_object('n', count(*), 'last_at', max(at)) from public.wiki_checks
    where section = p_section and target_id = p_target and version_no = v);
end $$;
revoke execute on function public.wiki_check(text, text) from public, anon;
grant execute on function public.wiki_check(text, text) to authenticated;

-- лічильник на поточну версію картки. Без wiki_version_of: функції в поданні виконуються з правами того, хто читає,
-- а її з сайту не викликають — тож версію беремо прямими з'єднаннями
create or replace view public.wiki_check_counts as
select c.section, c.target_id, c.version_no, count(*) as n, max(c.at) as last_at
from public.wiki_checks c
left join public.jobs j on c.section = 'job' and j.id = c.target_id
left join public.vehicles v on c.section = 'vehicle' and v.id::text = c.target_id
where c.version_no = coalesce(j.version, v.version)
group by c.section, c.target_id, c.version_no;
grant select on public.wiki_check_counts to anon, authenticated;

drop policy if exists "wiki checks: own read" on public.wiki_checks;
create policy "wiki checks: own read" on public.wiki_checks for select using (user_id = auth.uid());
