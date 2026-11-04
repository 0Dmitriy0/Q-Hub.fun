-- Q-Hub: Discord-бот — ціни скупників у канал-оголошення й новини з чернеток (specs/060, data-model.md).
-- • discord_bot    — один рядок налаштувань: сервер, канали цін і новин, увімкнено ціни / новини, вікно збирання, ліміт пересилань;
-- • discord_outbox — черга змін цін: наповнює тригер з price_history (туди потрапляє лише підтверджена ціна, 0043), лише коли prices_on;
-- • discord_posts  — журнал публікацій за стабільним ключем: проти дублів після збою й для ліміту пересилань на годину;
-- • news_drafts    — чернетки новин (US2): з журналу оновлень, змін сайту чи вручну; публікує лише admin кнопкою.
-- Усе — лише admin (RLS); функція discord-bot працює з service role. Токен бота — лише в секретах функції, тут його немає.
-- Розклад (pg_cron щохвилини) — не тут, а в supabase/sql/discord_cron.sql: тестова база без pg_cron. Файл можна запускати повторно.

-- ---------- налаштування (1 рядок) ----------
create table if not exists public.discord_bot (
  id boolean primary key default true check (id),
  guild_id text not null default '' check (guild_id = '' or guild_id ~ '^[0-9]{17,20}$'),
  prices_channel_id text not null default '' check (prices_channel_id = '' or prices_channel_id ~ '^[0-9]{17,20}$'),
  news_channel_id text not null default '' check (news_channel_id = '' or news_channel_id ~ '^[0-9]{17,20}$'),
  prices_on boolean not null default false,
  news_on boolean not null default false,
  window_min int not null default 5 check (window_min between 1 and 60),
  crosspost_per_hour int not null default 10 check (crosspost_per_hour between 1 and 50),
  last_ok_at timestamptz,
  last_error text not null default '' check (char_length(last_error) <= 500)
);
insert into public.discord_bot (id) values (true) on conflict do nothing;

-- ---------- черга змін цін ----------
create table if not exists public.discord_outbox (
  id bigint generated always as identity primary key,
  buyer_id text not null references public.buyers on delete cascade,
  item_id bigint not null references public.items on delete cascade,
  price bigint not null,
  prev_price bigint,
  at timestamptz not null,
  post_key text,
  posted_at timestamptz
);
create index if not exists discord_outbox_queue on public.discord_outbox (at) where post_key is null;

-- ---------- журнал публікацій ----------
create table if not exists public.discord_posts (
  key text primary key,
  channel_id text not null,
  message_id text,
  crossposted boolean not null default false,
  status text not null check (status in ('sending', 'sent', 'failed')),
  error text not null default '' check (char_length(error) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists discord_posts_channel_at on public.discord_posts (channel_id, created_at desc);

-- ---------- чернетки новин ----------
-- кожен пункт ≤ 300 символів; у check не можна підзапит, тож — окрема immutable функція
create or replace function public.news_items_ok(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(char_length(x) between 1 and 300), true) from unnest(p) x
$$;

create table if not exists public.news_drafts (
  id bigint generated always as identity primary key,
  source_ref text not null unique,
  title text not null check (char_length(title) between 1 and 120),
  added text[] not null default '{}' check (public.news_items_ok(added)),
  changed text[] not null default '{}' check (public.news_items_ok(changed)),
  removed text[] not null default '{}' check (public.news_items_ok(removed)),
  image_url text not null default '' check (image_url = '' or image_url ~ '^https://'),
  link text not null default '' check (link = '' or link ~ '^https://'),
  status text not null default 'draft' check (status in ('draft', 'sent', 'skipped', 'merged')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- права: лише admin ----------
alter table public.discord_bot enable row level security;
alter table public.discord_outbox enable row level security;
alter table public.discord_posts enable row level security;
alter table public.news_drafts enable row level security;

drop policy if exists "discord bot: admin" on public.discord_bot;
create policy "discord bot: admin" on public.discord_bot for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "discord outbox: admin" on public.discord_outbox;
create policy "discord outbox: admin" on public.discord_outbox for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "discord posts: admin" on public.discord_posts;
create policy "discord posts: admin" on public.discord_posts for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "news drafts: admin" on public.news_drafts;
create policy "news drafts: admin" on public.news_drafts for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.discord_bot, public.discord_outbox, public.discord_posts, public.news_drafts from anon;
grant select, insert, update, delete on public.discord_bot, public.discord_outbox, public.discord_posts, public.news_drafts to authenticated;

-- ---------- тригер черги ----------
-- нова точка історії ціни → подія для бота з попередньою ціною (null — предмет у скупника вперше, «нове»)
create or replace function public.discord_outbox_from_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select prices_on from public.discord_bot where id), false) then return null; end if;
  insert into public.discord_outbox (buyer_id, item_id, price, prev_price, at)
  values (new.buyer_id, new.item_id, new.price,
    (select h.price from public.price_history h
      where h.buyer_id = new.buyer_id and h.item_id = new.item_id and h.id <> new.id
        and (h.at, h.id) < (new.at, new.id)
      order by h.at desc, h.id desc limit 1),
    new.at);
  return null;
end $$;

drop trigger if exists discord_outbox_from_history on public.price_history;
create trigger discord_outbox_from_history after insert on public.price_history
  for each row execute function public.discord_outbox_from_history();
