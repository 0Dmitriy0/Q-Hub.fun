-- Q-Hub 0080: глосарій RP-термінів для пошуку по правилах (specs/093; конституція 1.4.0, принцип II).
-- glossary_terms — терміни у форматі src/data/glossary.json (term, aliases[], full_name, description, related_rules[]); читають усі.
-- Змінюють лише admin і moderator (is_wiki_mod) через RPC; кожна дія лишає версію в glossary_versions (знімок після дії,
-- автор, час) — історія, відкат до будь-якої версії, повернення прибраного. Запису в таблиці напряму немає.
-- Унікальність назв: жодна назва (term, aliases, full_name) не може належати іншому терміну, крім однакового term з різними
-- повними назвами (ТК — Team Kill і Трудовий кодекс). Початковий список — той самий, що в src/data/glossary.json.
-- Залежить від 0001, 0057 (is_wiki_mod). Файл можна запускати повторно.

create table if not exists public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null check (char_length(btrim(term)) between 1 and 12),
  aliases text[] not null default '{}' check (cardinality(aliases) <= 20),
  full_name text not null default '' check (char_length(full_name) <= 80),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  related_rules text[] not null default '{}' check (cardinality(related_rules) <= 10),
  hidden boolean not null default false,
  version int not null default 1,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists glossary_terms_term on public.glossary_terms (lower(term));

create table if not exists public.glossary_versions (
  id bigint generated always as identity primary key,
  term_id uuid not null references public.glossary_terms (id) on delete cascade,
  version_no int not null,
  action text not null check (action in ('create', 'edit', 'hide', 'unhide', 'revert')),
  data jsonb not null,
  author uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (term_id, version_no)
);

alter table public.glossary_terms enable row level security;
alter table public.glossary_versions enable row level security;
drop policy if exists "glossary_terms: read" on public.glossary_terms;
create policy "glossary_terms: read" on public.glossary_terms for select using (not hidden or public.is_wiki_mod());
drop policy if exists "glossary_versions: team read" on public.glossary_versions;
create policy "glossary_versions: team read" on public.glossary_versions for select using (public.is_wiki_mod());

-- ---------- службове ----------
create or replace function public.glossary_snapshot(t public.glossary_terms) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('term', t.term, 'aliases', to_jsonb(t.aliases), 'full_name', t.full_name,
    'description', t.description, 'related_rules', to_jsonb(t.related_rules), 'hidden', t.hidden)
$$;

-- назва вже належить іншому не прихованому терміну? повертає його term (або null)
create or replace function public.glossary_names_conflict(p_id uuid, p_term text, p_aliases text[], p_full_name text)
returns text language sql stable security definer set search_path = '' as $$
  with mine as (
    select lower(btrim(n)) as n from unnest(array[p_term, p_full_name] || coalesce(p_aliases, '{}')) n where btrim(coalesce(n, '')) <> ''
  ), other as (
    select g.term, g.full_name, lower(btrim(n)) as n
    from public.glossary_terms g, unnest(array[g.term, g.full_name] || g.aliases) n
    where not g.hidden and g.id is distinct from p_id and btrim(coalesce(n, '')) <> ''
  )
  select o.term from other o join mine m on m.n = o.n
  where not (lower(btrim(o.term)) = lower(btrim(p_term)) and o.n = lower(btrim(p_term))
             and btrim(o.full_name) <> '' and btrim(coalesce(p_full_name, '')) <> ''
             and lower(btrim(o.full_name)) <> lower(btrim(p_full_name)))
  limit 1
$$;

create or replace function public.glossary_check(p_term text, p_aliases text[], p_full_name text, p_description text, p_related text[])
returns void language plpgsql immutable set search_path = '' as $$
declare a text;
begin
  if char_length(btrim(coalesce(p_term, ''))) not between 1 and 12 then raise exception 'Скорочення — від 1 до 12 символів.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 1 and 300 then raise exception 'Пояснення — від 1 до 300 символів.' using errcode = '22023'; end if;
  if char_length(coalesce(p_full_name, '')) > 80 then raise exception 'Повна назва — до 80 символів.' using errcode = '22023'; end if;
  if cardinality(coalesce(p_aliases, '{}')) > 20 then raise exception 'Інших назв — не більше 20.' using errcode = '22023'; end if;
  foreach a in array coalesce(p_aliases, '{}') loop
    if char_length(btrim(a)) not between 1 and 80 then raise exception 'Кожна інша назва — від 1 до 80 символів.' using errcode = '22023'; end if;
  end loop;
  if cardinality(coalesce(p_related, '{}')) > 10 then raise exception 'Пов''язаних пунктів — не більше 10.' using errcode = '22023'; end if;
  foreach a in array coalesce(p_related, '{}') loop
    if char_length(btrim(a)) not between 1 and 40 then raise exception 'Кожен пов''язаний пункт — до 40 символів, напр. «ЗП 6.9».' using errcode = '22023'; end if;
  end loop;
end $$;

create or replace function public.glossary_log(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.glossary_terms;
begin
  select * into t from public.glossary_terms where id = p_id;
  insert into public.glossary_versions (term_id, version_no, action, data, author)
  values (p_id, t.version, p_action, public.glossary_snapshot(t), auth.uid());
end $$;

create or replace function public.glossary_require_team() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_wiki_mod() then raise exception 'Глосарій змінюють лише адмін і модератори.' using errcode = '42501'; end if;
end $$;

-- ---------- зберегти (новий — p_id null) ----------
create or replace function public.glossary_save(p_id uuid, p_term text, p_aliases text[], p_full_name text, p_description text, p_related text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare c text; nid uuid; al text[]; rel text[];
begin
  perform public.glossary_require_team();
  al := array(select distinct btrim(a) from unnest(coalesce(p_aliases, '{}')) a where btrim(a) <> '');
  rel := array(select btrim(a) from unnest(coalesce(p_related, '{}')) a where btrim(a) <> '');
  perform public.glossary_check(p_term, al, p_full_name, p_description, rel);
  c := public.glossary_names_conflict(p_id, btrim(p_term), al, btrim(coalesce(p_full_name, '')));
  if c is not null then raise exception 'Така назва вже є в терміні «%».', c using errcode = '23505'; end if;
  if p_id is null then
    insert into public.glossary_terms (term, aliases, full_name, description, related_rules, updated_by)
    values (btrim(p_term), al, btrim(coalesce(p_full_name, '')), btrim(p_description), rel, auth.uid())
    returning id into nid;
    perform public.glossary_log(nid, 'create');
    return nid;
  end if;
  update public.glossary_terms set term = btrim(p_term), aliases = al, full_name = btrim(coalesce(p_full_name, '')),
    description = btrim(p_description), related_rules = rel, version = version + 1, updated_by = auth.uid(), updated_at = now()
    where id = p_id;
  if not found then raise exception 'Термін не знайдено.' using errcode = 'P0002'; end if;
  perform public.glossary_log(p_id, 'edit');
  return p_id;
end $$;

create or replace function public.glossary_hide(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.glossary_require_team();
  update public.glossary_terms set hidden = true, version = version + 1, updated_by = auth.uid(), updated_at = now()
    where id = p_id and not hidden;
  if not found then raise exception 'Термін не знайдено або вже прибраний.' using errcode = 'P0002'; end if;
  perform public.glossary_log(p_id, 'hide');
end $$;

create or replace function public.glossary_unhide(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.glossary_terms; c text;
begin
  perform public.glossary_require_team();
  select * into t from public.glossary_terms where id = p_id and hidden;
  if not found then raise exception 'Прибраний термін не знайдено.' using errcode = 'P0002'; end if;
  c := public.glossary_names_conflict(p_id, t.term, t.aliases, t.full_name);
  if c is not null then raise exception 'Не можна повернути: назва вже є в терміні «%».', c using errcode = '23505'; end if;
  update public.glossary_terms set hidden = false, version = version + 1, updated_by = auth.uid(), updated_at = now() where id = p_id;
  perform public.glossary_log(p_id, 'unhide');
end $$;

-- відкат: вміст вказаної версії стає поточним (нова версія з дією revert)
create or replace function public.glossary_revert(p_id uuid, p_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare d jsonb; c text; al text[]; rel text[];
begin
  perform public.glossary_require_team();
  select data into d from public.glossary_versions where term_id = p_id and version_no = p_version;
  if d is null then raise exception 'Такої версії немає.' using errcode = 'P0002'; end if;
  al := array(select jsonb_array_elements_text(d -> 'aliases'));
  rel := array(select jsonb_array_elements_text(d -> 'related_rules'));
  if not coalesce((d ->> 'hidden')::boolean, false) then
    c := public.glossary_names_conflict(p_id, d ->> 'term', al, d ->> 'full_name');
    if c is not null then raise exception 'Не можна відкотити: назва вже є в терміні «%».', c using errcode = '23505'; end if;
  end if;
  update public.glossary_terms set term = d ->> 'term', aliases = al, full_name = d ->> 'full_name', description = d ->> 'description',
    related_rules = rel, hidden = coalesce((d ->> 'hidden')::boolean, false), version = version + 1, updated_by = auth.uid(), updated_at = now()
    where id = p_id;
  if not found then raise exception 'Термін не знайдено.' using errcode = 'P0002'; end if;
  perform public.glossary_log(p_id, 'revert');
end $$;

revoke all on function public.glossary_snapshot(public.glossary_terms) from public, anon, authenticated;
revoke all on function public.glossary_names_conflict(uuid, text, text[], text) from public, anon, authenticated;
revoke all on function public.glossary_check(text, text[], text, text, text[]) from public, anon, authenticated;
revoke all on function public.glossary_log(uuid, text) from public, anon, authenticated;
revoke all on function public.glossary_require_team() from public, anon;
revoke all on function public.glossary_save(uuid, text, text[], text, text, text[]) from public, anon;
revoke all on function public.glossary_hide(uuid) from public, anon;
revoke all on function public.glossary_unhide(uuid) from public, anon;
revoke all on function public.glossary_revert(uuid, int) from public, anon;
grant execute on function public.glossary_require_team() to authenticated;
grant execute on function public.glossary_save(uuid, text, text[], text, text, text[]) to authenticated;
grant execute on function public.glossary_hide(uuid) to authenticated;
grant execute on function public.glossary_unhide(uuid) to authenticated;
grant execute on function public.glossary_revert(uuid, int) to authenticated;

-- ---------- початковий список (той самий, що src/data/glossary.json; повтор міграції не дублює й не затирає правок) ----------
do $$
declare r record; nid uuid;
begin
  for r in select * from (values
    ('ДМ', array['DM', 'DeathMatch', 'дезматч', 'вбивство без причини'], 'DeathMatch', 'Вбивство чи нанесення шкоди без вагомої RP-причини.', array['ЗП 6.9']),
    ('ДБ', array['DB', 'DriveBy', 'драйвбай'], 'DriveBy', 'Вбивство чи шкода з машини або машиною (таран).', array['ЗП 6.4']),
    ('СК', array['SK', 'Spawn Kill', 'спавнкіл'], 'Spawn Kill', 'Вбивство чи шкода на місці спавну або титульній території.', array['ЗП 6.6']),
    ('ТК', array['TK', 'Team Kill', 'тімкіл'], 'Team Kill', 'Вбивство чи шкода членам своєї чи союзної організації.', array['ЗП 6.5']),
    ('ТК', array[]::text[], 'Трудовий кодекс', 'Трудовий кодекс штату Quant — закон про роботу й працевлаштування.', array[]::text[]),
    ('РП', array['RP', 'Role Play', 'RolePlay', 'рольова гра'], 'Role Play', 'Гра за ролями: кожен дотримується своєї ролі й реалістичної поведінки персонажа.', array['ЗП 6.1']),
    ('МГ', array['MG', 'MetaGaming', 'метагеймінг'], 'MetaGaming', 'Використання OOC-інформації (з-поза гри) в IC (у грі).', array['ЗП 6.8']),
    ('ГМ', array['GM', 'God Mode', 'годмод'], 'God Mode', 'Поведінка, ніби персонаж безсмертний — як у режимі бога.', array[]::text[]),
    ('ГМ', array[]::text[], 'Головний модератор', 'Головний модератор сервера; ЗГМ — його заступник.', array[]::text[]),
    ('ПГ', array['PG', 'PowerGaming', 'павергеймінг'], 'PowerGaming', 'Нереалістичне геройство: напад без зброї на озброєного, бійка 1 проти 5, вміння, яких персонаж не має.', array['ЗП 6.7']),
    ('РК', array['RK', 'Revenge Kill', 'ревендж', 'помста'], 'Revenge Kill', 'Повернення на місце смерті чи помста після загибелі.', array['ЗП 6.10']),
    ('БХ', array['BH', 'Bunny Hop', 'банніхоп'], 'Bunny Hop', 'NonRP біг зі стрибками для швидшого пересування.', array[]::text[]),
    ('КК', array[]::text[], 'Кримінальний кодекс', 'Кримінальний кодекс штату Quant — злочини й покарання за них.', array[]::text[]),
    ('АК', array[]::text[], 'Адміністративний кодекс', 'Адміністративний кодекс штату Quant — проступки, штрафи.', array[]::text[]),
    ('ДК', array['ПДР'], 'Дорожній кодекс', 'Дорожній кодекс штату Quant — правила дорожнього руху й штрафи за порушення.', array[]::text[]),
    ('ПК', array[]::text[], 'Процесуальний кодекс', 'Процесуальний кодекс штату Quant — як затримують, допитують і судять.', array[]::text[]),
    ('ЗЗ', array['GZ', 'Green Zone', 'зелена зона'], 'Зелена зона', 'Мерія, вокзали, лікарні тощо: стрільба й шкода гравцям заборонені.', array['ПЗЗ 1.1']),
    ('НРД', array['NRD', 'NonRP Drive'], 'NonRP Drive', 'Нереалістична їзда: стрибки, їзда там, де транспорт не проїде.', array[]::text[]),
    ('Деморган', array['demorgan'], '', 'Покарання від адміністрації: персонаж на час опиняється в ізоляції.', array[]::text[]),
    ('Ганбан', array['gunban'], '', 'Покарання від адміністрації: заборона користуватися зброєю на час.', array[]::text[]),
    ('Варн', array['warn'], '', 'Попередження від адміністрації; кілька варнів — бан.', array[]::text[])
  ) v(term, aliases, full_name, description, related) loop
    if not exists (select 1 from public.glossary_terms g where lower(g.term) = lower(r.term) and g.full_name = r.full_name) then
      insert into public.glossary_terms (term, aliases, full_name, description, related_rules)
      values (r.term, r.aliases, r.full_name, r.description, r.related) returning id into nid;
      insert into public.glossary_versions (term_id, version_no, action, data)
      select nid, 1, 'create', public.glossary_snapshot(g) from public.glossary_terms g where g.id = nid;
    end if;
  end loop;
end $$;
