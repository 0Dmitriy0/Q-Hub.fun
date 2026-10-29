-- Q-Hub: папка «Івенти» на мапі й мітки партіями (specs/017). Привиди переїжджають з «Міні-ігри, квести й контракти»
-- в «Івенти», там же — «Гарбузи» (Хелловін, мітки з Open Hydra Map за згодою авторів, specs/012 FR-009).
-- Партія — мітки одного імпорту: джерело, категорія, кількість. Гравці бачать партію лише після позначки «перевірено»;
-- відкат — видалити партію (її мітки йдуть разом з нею). Імпорт — лише через import_map_batch(), лише admin.
-- Файл можна запускати повторно.
update public.map_categories set grp = 'Івенти' where id = 'pryvydy';
insert into public.map_categories (id, name, grp, icon, color, sort, shown)
  values ('harbuzy', 'Гарбузи', 'Івенти', '/icons/map/pumpkin.svg', '#ff8c1a', 243, false)
  on conflict (id) do nothing;

create table if not exists public.map_batches (
  id bigint generated always as identity primary key,
  category_id text not null references public.map_categories (id) on delete cascade on update cascade,
  source text not null check (source in ('ohm', 'quantfun', 'game')),
  count integer not null default 0 check (count >= 0),
  published boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.map_points add column if not exists batch_id bigint references public.map_batches (id) on delete cascade;
alter table public.map_points add column if not exists source text check (source is null or source in ('ohm', 'quantfun', 'game'));
create index if not exists map_points_batch on public.map_points (batch_id);

alter table public.map_batches enable row level security;
drop policy if exists "map_batches: admin" on public.map_batches;
create policy "map_batches: admin" on public.map_batches for all using (public.is_admin()) with check (public.is_admin());

-- чи опублікована партія — для політики міток (саму таблицю партій гість не читає)
create or replace function public.map_batch_published(b bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select published from public.map_batches where id = b), false)
$$;
revoke all on function public.map_batch_published(bigint) from public;
grant execute on function public.map_batch_published(bigint) to anon, authenticated;

drop policy if exists "map_points: read all" on public.map_points;
drop policy if exists "map_points: read published" on public.map_points;
create policy "map_points: read published" on public.map_points for select
  using (batch_id is null or public.is_admin() or public.map_batch_published(batch_id));

-- імпорт партії: точки [{x, y, name}]; поза мапою і ближче 10 м до наявної мітки категорії
-- (зокрема вже доданої з цієї ж партії) — пропускаються
create or replace function public.import_map_batch(p_category text, p_source text, p_points jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare b bigint; p jsonb; px double precision; py double precision; added int := 0; skipped int := 0; outside int := 0;
begin
  if not public.is_admin() then raise exception 'імпорт міток — лише для адміна' using errcode = '42501'; end if;
  if jsonb_typeof(p_points) is distinct from 'array' then raise exception 'точки — масив' using errcode = '22023'; end if;
  insert into public.map_batches (category_id, source) values (p_category, p_source) returning id into b;
  for p in select * from jsonb_array_elements(p_points) loop
    px := (p ->> 'x')::double precision; py := (p ->> 'y')::double precision;
    if px is null or py is null or px not between -6000 and 6800 or py not between -4400 and 8500 then outside := outside + 1; continue; end if;
    if exists (select 1 from public.map_points m where m.category_id = p_category and (m.x - px) ^ 2 + (m.y - py) ^ 2 < 100) then
      skipped := skipped + 1; continue;
    end if;
    insert into public.map_points (category_id, name, x, y, batch_id, source)
      values (p_category, left(coalesce(p ->> 'name', ''), 160), px, py, b, p_source);
    added := added + 1;
  end loop;
  update public.map_batches set count = added where id = b;
  return json_build_object('batch', b, 'added', added, 'skipped', skipped, 'outside', outside);
end $$;
revoke all on function public.import_map_batch(text, text, jsonb) from public, anon;
grant execute on function public.import_map_batch(text, text, jsonb) to authenticated;
