-- Q-Hub: адмін-панель (specs/039, доповнення 2026-11-03) — «Гравці» одразу показують усі акаунти сайту, а не лише знайдені.
-- admin_accounts: увесь список новіші першими порціями (p_offset / p_limit), q — фільтр за ніком чи Discord (порожній — усі),
-- total — скільки акаунтів під фільтром. Ті самі поля, що в admin_find_accounts (0046): без обліку й балансів.
-- Лише admin (is_admin() першим рядком). Файл можна запускати повторно.

create or replace function public.admin_accounts(q text default '', p_offset int default 0, p_limit int default 50)
returns table (id uuid, nick text, name text, avatar_url text, role text, created_at timestamptz,
               last_seen timestamptz, version text, characters json, total bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare s text := btrim(coalesce(q, ''));
begin
  if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;
  if p_limit not between 1 and 100 or p_offset < 0 then raise exception 'Порція — 1–100 акаунтів' using errcode = '22023'; end if;
  s := case when s = '' then null else '%' || replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  return query
  select p.id, p.nick, p.name, p.avatar_url, p.role, p.created_at, a.seen_at, a.version,
         coalesce((select json_agg(json_build_object('name', c.name, 'static_id', c.static_id) order by c.created_at)
                   from public.characters c where c.owner = p.id), '[]'::json),
         count(*) over ()
  from public.profiles p
  left join public.app_presence a on a.user_id = p.id
  where s is null or p.nick ilike s or p.name ilike s
  order by p.created_at desc, p.id
  offset p_offset limit p_limit;
end $$;

revoke all on function public.admin_accounts(text, int, int) from public, anon;
grant execute on function public.admin_accounts(text, int, int) to authenticated;
