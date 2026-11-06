-- Q-Hub 0062: блок «Команда Q-Hub» на головній.
-- team_members — хто в команді, підпис ролі й порядок; змінює лише admin (адмінка → «Гравці й ролі»), читають усі.
-- characters.team_public — персонажа (Ім'я_Прізвище й статік) показано в команді; ставить лише сам власник
-- (політика «свої персонажі», 0001), за замовчуванням — ні: статік — ігрова особа, без згоди не показується.
-- public.team — що бачить гість: нік у Q-Hub (без ніку — людини в блоці немає; ім'я з Discord не показується),
-- аватар, підпис, порядок і лише відкриті персонажі. Файл можна запускати повторно.

create table if not exists public.team_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 40),
  sort int not null default 100 check (sort between 0 and 1000),
  created_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
drop policy if exists "team: read all" on public.team_members;
create policy "team: read all" on public.team_members for select using (true);
drop policy if exists "team: admin write" on public.team_members;
create policy "team: admin write" on public.team_members for all using (public.is_admin()) with check (public.is_admin());
grant select on public.team_members to anon, authenticated;
grant insert, update, delete on public.team_members to authenticated;

alter table public.characters add column if not exists team_public boolean not null default false;

create or replace view public.team with (security_barrier) as
select btrim(pr.nick) as name, pr.avatar_url, tm.title, tm.sort,
  coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'static', c.static_id) order by c.created_at)
            from public.characters c where c.owner = tm.user_id and c.team_public), '[]'::jsonb) as characters
from public.team_members tm join public.profiles pr on pr.id = tm.user_id
where nullif(btrim(pr.nick), '') is not null;
grant select on public.team to anon, authenticated;
