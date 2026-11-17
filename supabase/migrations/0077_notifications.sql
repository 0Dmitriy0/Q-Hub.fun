-- Q-Hub 0077: сповіщення гравцям на сайті (specs/091, US4).
-- Адмін надсилає сповіщення (переможцю з топу або будь-кому за ніком): заголовок, текст, категорія конкурсу, приз.
-- Гравець бачить лише свої (RLS) і позначає їх прочитаними лише через notification_read / notifications_read_all.
-- id приходить з клієнта — повторне «Надіслати» не створює дубль (FR-031).
-- Поля discord_* заповнює бот (0078); тут лише стан «в черзі».
-- Залежить від 0001, 0006. Файл можна запускати повторно.

create table if not exists public.notifications (
  id uuid primary key,
  recipient uuid not null references public.profiles (id) on delete cascade,
  sender uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 1500),
  category text not null check (category in ('prices', 'marks', 'guides', 'other')),
  prize text not null default '' check (char_length(prize) <= 200),
  place int check (place between 1 and 10),
  period_from date,
  period_to date,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  discord_status text not null default 'queued' check (discord_status in ('queued', 'sent', 'failed')),
  discord_error text not null default '' check (char_length(discord_error) <= 300),
  discord_attempts int not null default 0 check (discord_attempts between 0 and 5),
  discord_next_at timestamptz not null default now(),
  discord_sent_at timestamptz
);
create index if not exists notifications_recipient on public.notifications (recipient, created_at desc);
create index if not exists notifications_unread on public.notifications (recipient) where read_at is null;
create index if not exists notifications_dm_queue on public.notifications (discord_next_at) where discord_status = 'queued';
create index if not exists notifications_created on public.notifications (created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "notifications: own or admin read" on public.notifications;
create policy "notifications: own or admin read" on public.notifications for select
  using (recipient = auth.uid() or public.is_admin());

-- ---------- надіслати (admin) ----------
create or replace function public.notification_send(p_id uuid, p_recipient uuid, p_title text, p_body text, p_category text,
  p_prize text default '', p_place int default null, p_from date default null, p_to date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'лише для адміна' using errcode = '42501'; end if;
  if p_id is null then raise exception 'немає id' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_recipient) then
    raise exception 'гравця не знайдено' using errcode = 'P0002';
  end if;
  insert into public.notifications (id, recipient, sender, title, body, category, prize, place, period_from, period_to)
  values (p_id, p_recipient, auth.uid(), btrim(p_title), btrim(p_body), p_category, btrim(coalesce(p_prize, '')),
          p_place, p_from, p_to)
  on conflict (id) do nothing;
  return p_id;
end $$;

-- ---------- історія для адміна ----------
create or replace function public.notifications_admin_list(p_limit int default 100, p_before timestamptz default null)
returns table (id uuid, recipient uuid, recipient_nick text, sender_nick text, title text, body text, category text, prize text,
               place int, period_from date, period_to date, created_at timestamptz, read_at timestamptz,
               discord_status text, discord_error text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'лише для адміна' using errcode = '42501'; end if;
  return query
  select n.id, n.recipient, nullif(btrim(r.nick), ''), nullif(btrim(s.nick), ''), n.title, n.body, n.category, n.prize,
    n.place, n.period_from, n.period_to, n.created_at, n.read_at, n.discord_status, n.discord_error
  from public.notifications n
  left join public.profiles r on r.id = n.recipient
  left join public.profiles s on s.id = n.sender
  where p_before is null or n.created_at < p_before
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

-- ---------- прочитання (лише власні) ----------
create or replace function public.notification_read(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = coalesce(read_at, now())
  where id = p_id and recipient = auth.uid() and auth.uid() is not null
$$;

create or replace function public.notifications_read_all() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then return 0; end if;
  update public.notifications set read_at = now() where recipient = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- пошук гравця за ніком (admin) ----------
create or replace function public.profiles_search_nick(p_q text)
returns table (id uuid, nick text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'лише для адміна' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_q, ''))) < 2 then return; end if;
  return query
  select p.id, btrim(p.nick) from public.profiles p
  where nullif(btrim(p.nick), '') is not null
    and p.nick ilike '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by char_length(p.nick), p.nick
  limit 20;
end $$;

revoke all on function public.notification_send(uuid, uuid, text, text, text, text, int, date, date) from public, anon;
revoke all on function public.notifications_admin_list(int, timestamptz) from public, anon;
revoke all on function public.notification_read(uuid) from public, anon;
revoke all on function public.notifications_read_all() from public, anon;
revoke all on function public.profiles_search_nick(text) from public, anon;
grant execute on function public.notification_send(uuid, uuid, text, text, text, text, int, date, date) to authenticated;
grant execute on function public.notifications_admin_list(int, timestamptz) to authenticated;
grant execute on function public.notification_read(uuid) to authenticated;
grant execute on function public.notifications_read_all() to authenticated;
grant execute on function public.profiles_search_nick(text) to authenticated;
