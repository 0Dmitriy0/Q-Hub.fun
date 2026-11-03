-- Q-Hub: заробіток персонажа за годину (specs/044, конституція 1.2.0, принцип V).
-- • game_sessions + підсумок грошей сеансу: баланс HUD (готівка + картка) на першому й останньому стабільному
--   зчитуванні, сума зростань («Заробив») і позначка «був неправдоподібний стрибок». Окремих зчитувань чи операцій
--   не зберігаємо — лише один підсумок на сеанс. Права — наявна політика «сесії персонажа» (лише власник).
-- • money_rules — пороги без релізу програми: стрибок понад max_jump за одне зчитування не зараховується,
--   сеанси коротші за min_minutes не входять у середнє. Читають усі, змінює лише admin.
-- Колонки nullable: старі рядки й програма 0.6.x пишуть сеанси без грошей. Файл можна запускати повторно.

alter table public.game_sessions
  add column if not exists money_from timestamptz,
  add column if not exists money_to timestamptz,
  add column if not exists money_start bigint,
  add column if not exists money_end bigint,
  add column if not exists money_gain bigint,
  add column if not exists money_flag boolean not null default false;

alter table public.game_sessions drop constraint if exists game_sessions_money_check;
alter table public.game_sessions add constraint game_sessions_money_check check (
  (money_from is null and money_to is null and money_start is null and money_end is null and money_gain is null)
  or (money_from is not null and money_to is not null and money_start is not null and money_end is not null and money_gain is not null
      and money_to >= money_from and money_start >= 0 and money_end >= 0 and money_gain >= 0)
);

-- кабінет читає сеанси персонажа з грошима за часом
create index if not exists game_sessions_money_idx on public.game_sessions (character_id, started_at) where money_from is not null;

create table if not exists public.money_rules (
  id boolean primary key default true check (id),
  max_jump bigint not null default 5000000 check (max_jump between 100000 and 1000000000),
  min_minutes int not null default 5 check (min_minutes between 1 and 120)
);
insert into public.money_rules (id) values (true) on conflict do nothing;
alter table public.money_rules enable row level security;
drop policy if exists "пороги заробітку читають усі" on public.money_rules;
create policy "пороги заробітку читають усі" on public.money_rules for select using (true);
drop policy if exists "пороги заробітку змінює адмін" on public.money_rules;
create policy "пороги заробітку змінює адмін" on public.money_rules for update using (public.is_admin()) with check (public.is_admin());
revoke insert, delete, update on public.money_rules from anon, authenticated;
grant select on public.money_rules to anon, authenticated;
grant update (max_jump, min_minutes) on public.money_rules to authenticated;
