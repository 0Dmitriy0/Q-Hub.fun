-- Q-Hub 0078: доставка сповіщень у Discord DM ботом сайту (specs/091, US5; contracts/discord-dm.md).
-- Бот (edge-функція discord-bot, дія tick щохвилини) бере пакет «в черзі» з Discord-ідентифікатором гравця з auth.identities
-- і записує результат. Повтори: через 1, 2, 4, 6 хв — кінцевий статус не пізніше ніж за ~15 хв (SC-007); після 5-ї спроби — failed.
-- Ідентифікатор Discord віддається лише service_role (бот), у браузер не потрапляє.
-- discord_bot.dm_on — адмін може вимкнути DM; тоді бот одразу ставить failed «надсилання в Discord вимкнено».
-- Залежить від 0055, 0077. Файл можна запускати повторно.

alter table public.discord_bot add column if not exists dm_on boolean not null default true;

create or replace function public.notification_dm_batch(p_limit int default 20)
returns table (id uuid, title text, body text, prize text, discord_user_id text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with picked as (
    select n.id from public.notifications n
    where n.discord_status = 'queued' and n.discord_next_at <= now()
    order by n.discord_next_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  )
  select n.id, n.title, n.body, n.prize,
    (select i.provider_id from auth.identities i where i.user_id = n.recipient and i.provider = 'discord' limit 1)
  from public.notifications n join picked using (id);
end $$;

-- p_status: sent | retry | failed. retry зсуває наступну спробу; п'ята невдала — failed
create or replace function public.notification_dm_result(p_id uuid, p_status text, p_error text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare a int;
begin
  if p_status not in ('sent', 'retry', 'failed') then raise exception 'поганий статус' using errcode = '22023'; end if;
  if p_status = 'sent' then
    update public.notifications set discord_status = 'sent', discord_error = '', discord_sent_at = now(),
      discord_attempts = least(discord_attempts + 1, 5)
      where id = p_id;
  elsif p_status = 'failed' then
    update public.notifications set discord_status = 'failed', discord_error = left(coalesce(p_error, ''), 300),
      discord_attempts = least(discord_attempts + 1, 5)
      where id = p_id;
  else
    select discord_attempts + 1 into a from public.notifications where id = p_id;
    if a is null then return; end if;
    if a >= 5 then
      update public.notifications set discord_status = 'failed', discord_attempts = 5,
        discord_error = left(coalesce(p_error, '') || ' (спроби вичерпано)', 300)
        where id = p_id;
    else
      update public.notifications set discord_attempts = a, discord_error = left(coalesce(p_error, ''), 300),
        discord_next_at = now() + make_interval(mins => (array[1, 2, 4, 6])[a])
        where id = p_id;
    end if;
  end if;
end $$;

revoke all on function public.notification_dm_batch(int) from public, anon, authenticated;
revoke all on function public.notification_dm_result(uuid, text, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.notification_dm_batch(int) to service_role;
    grant execute on function public.notification_dm_result(uuid, text, text) to service_role;
  end if;
end $$;
