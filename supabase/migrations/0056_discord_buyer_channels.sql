-- Q-Hub: Discord-бот — окремий канал для кожного скупника (specs/060, рішення власника 2026-11-04).
-- Зміни цін скупника йдуть лише в його канал; скупник без каналу в Discord не публікується (загального зведення немає).
-- discord_bot.prices_channel_id більше не використовується для цін. Лише admin (RLS). Файл можна запускати повторно.

create table if not exists public.discord_buyer_channels (
  buyer_id text primary key references public.buyers on delete cascade on update cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$')
);

alter table public.discord_buyer_channels enable row level security;
drop policy if exists "discord buyer channels: admin" on public.discord_buyer_channels;
create policy "discord buyer channels: admin" on public.discord_buyer_channels for all
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.discord_buyer_channels from anon;
grant select, insert, update, delete on public.discord_buyer_channels to authenticated;
