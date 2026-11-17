-- Q-Hub 0079: налаштування правил зарахування конкурсу активності (specs/091, US6).
-- Адмін змінює ліміт зарахувань ціни за добу (1…50) і ролі, що не беруть участі, без зміни коду; звіряє події з джерелами.
-- Залежить від 0075, 0076. Файл можна запускати повторно.

create or replace function public.activity_settings_get()
returns table (price_daily_limit int, excluded_roles text[], updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.activity_require_admin();
  return query select s.price_daily_limit, s.excluded_roles, s.updated_at from public.activity_settings s where s.id;
end $$;

create or replace function public.activity_settings_set(p_price_daily_limit int, p_excluded_roles text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.activity_require_admin();
  if p_price_daily_limit is null or p_price_daily_limit not between 1 and 50 then
    raise exception 'ліміт — від 1 до 50' using errcode = '22023';
  end if;
  if p_excluded_roles is null or not (p_excluded_roles <@ array['user', 'editor', 'moderator', 'admin']::text[]) then
    raise exception 'невідома роль' using errcode = '22023';
  end if;
  insert into public.activity_settings (id, price_daily_limit, excluded_roles, updated_by, updated_at)
  values (true, p_price_daily_limit, (select coalesce(array_agg(distinct r order by r), '{}') from unnest(p_excluded_roles) r),
          auth.uid(), now())
  on conflict (id) do update set price_daily_limit = excluded.price_daily_limit, excluded_roles = excluded.excluded_roles,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

create or replace function public.activity_resync() returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform public.activity_require_admin();
  return public.activity_sync_all();
end $$;

revoke all on function public.activity_settings_get() from public, anon;
revoke all on function public.activity_settings_set(int, text[]) from public, anon;
revoke all on function public.activity_resync() from public, anon;
grant execute on function public.activity_settings_get() to authenticated;
grant execute on function public.activity_settings_set(int, text[]) to authenticated;
grant execute on function public.activity_resync() to authenticated;
