-- Q-Hub: загальні посилання сайту й програми (specs/037) — поки одне: Discord Q-Hub на сервері сім'ї CORE.
-- Один рядок. Бачать усі; змінює лише admin. Порожньо — посилання немає, кнопки Discord ніде не показуються. Файл можна запускати повторно.
create table if not exists public.site_links (
  id boolean primary key default true check (id),   -- рядок завжди один
  discord_url text not null default ''
    check (discord_url = '' or discord_url ~ '^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]{2,64}/?$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null
);

/* хто й коли змінив — ставить база, а не сайт */
create or replace function public.site_links_stamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists site_links_stamp on public.site_links;
create trigger site_links_stamp before insert or update on public.site_links for each row execute function public.site_links_stamp();

alter table public.site_links enable row level security;
drop policy if exists "site_links: read all" on public.site_links;
drop policy if exists "site_links: admin write" on public.site_links;
create policy "site_links: read all" on public.site_links for select using (true);
create policy "site_links: admin write" on public.site_links for all using (public.is_admin()) with check (public.is_admin());

-- стартове запрошення від власника 2026-11-01; повторний запуск не перезаписує те, що адмін змінив пізніше
insert into public.site_links (id, discord_url) values (true, 'https://discord.gg/RxUk5mGgy') on conflict (id) do nothing;
