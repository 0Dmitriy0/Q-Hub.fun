-- Q-Hub: нік акаунта й персонажі зі своїм статіком; ціна — від персонажа (specs/025).
-- • profiles.nick — нік у Q-Hub, який гравець вибирає сам: 3–20 символів (латиниця, цифри, «_»), унікальний без
--   урахування регістру, змінюється не частіше раз на 30 днів (перший вибір і admin — без обмеження).
-- • characters.static_id — статік персонажа, унікальний на всю систему; Ім'я_Прізвище — як у грі; ≤ 3 персонажі.
-- • price_reports.character_id — з якого персонажа вписано ціну; ціну приймає лише акаунт з ніком і персонажем зі
--   статіком. Без character_id — лише якщо персонаж один (старі версії програми).
-- • Публічні зведення показують нік (і Ім'я_Прізвище біля ціни), статіку там більше немає.
-- • Перенесення: статік профілю → персонажу з тим самим ім'ям (інакше найстаршому); ціни → цьому персонажу.
--   profiles.game_name/static_id лишаються для відкату, але ніде не читаються. Файл можна запускати повторно.

-- ---------- нік акаунта ----------
alter table public.profiles add column if not exists nick text;
alter table public.profiles add column if not exists nick_changed_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_nick_format') then
    alter table public.profiles add constraint profiles_nick_format check (nick is null or nick ~ '^[A-Za-z0-9_]{3,20}$');
  end if;
end $$;
create unique index if not exists profiles_nick_lower on public.profiles (lower(nick));
grant update (nick) on public.profiles to authenticated;

create or replace function public.check_nick() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.nick is not distinct from old.nick then return new; end if;
  if new.nick is null then raise exception 'Нік не можна прибрати — лише змінити.'; end if;
  new.nick := btrim(new.nick);
  if exists (select 1 from public.profiles where lower(nick) = lower(new.nick) and id <> new.id) then
    raise exception 'Нік «%» уже зайнятий.', new.nick;
  end if;
  if old.nick is not null and old.nick_changed_at > now() - interval '30 days' and not public.is_admin() then
    raise exception 'Нік можна змінити знову з %.', to_char(old.nick_changed_at + interval '30 days', 'DD.MM.YYYY');
  end if;
  new.nick_changed_at := now();
  return new;
end $$;
drop trigger if exists profiles_nick on public.profiles;
create trigger profiles_nick before update of nick on public.profiles for each row execute function public.check_nick();

-- ---------- персонажі: статік, Ім'я_Прізвище, не більше трьох ----------
alter table public.characters add column if not exists static_id integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'characters_static_range') then
    alter table public.characters add constraint characters_static_range check (static_id between 1 and 999999999);
  end if;
end $$;
create unique index if not exists characters_static_uniq on public.characters (static_id) where static_id is not null;

-- ім'я перевіряється лише в нових і перейменованих: старі персонажі (до 0.4.7 формат не вимагався) лишаються як є
create or replace function public.check_character() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.characters where owner = new.owner) >= 3 then
    raise exception 'В акаунті вже 3 персонажі.';
  end if;
  if (tg_op = 'INSERT' or new.name is distinct from old.name)
     and new.name !~ '^[A-Z][a-zA-Z]{1,14}_[A-Z][a-zA-Z]{1,14}$' then
    raise exception 'Ім''я й прізвище персонажа — латиницею через «_», як у грі: Dmitriy_Core';
  end if;
  if new.static_id is not null and (tg_op = 'INSERT' or new.static_id is distinct from old.static_id)
     and exists (select 1 from public.characters where static_id = new.static_id and id <> new.id) then
    raise exception 'Статік % уже має інший персонаж.', new.static_id;
  end if;
  return new;
end $$;
drop trigger if exists characters_check on public.characters;
create trigger characters_check before insert or update of name, static_id on public.characters
  for each row execute function public.check_character();

-- ---------- ціна від персонажа ----------
alter table public.price_reports add column if not exists character_id uuid references public.characters (id) on delete set null;
create index if not exists price_reports_character on public.price_reports (character_id);

-- як у 0036 (межі для програми, ліміт за годину, виправлення за 10 хв); замість ніка й статіку профілю — нік акаунта
-- і персонаж зі статіком
create or replace function public.check_buyer_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bi public.buyer_items; staff boolean := public.is_staff(); pr public.profiles; ch public.characters; n int;
begin
  if new.kind <> 'buyer' then return new; end if;
  select * into bi from public.buyer_items where buyer_id = new.buyer_id and item_id = new.item_id;
  if not found then raise exception 'У цього скупника немає такого товару.'; end if;
  if new.reporter is not null then
    select * into pr from public.profiles where id = new.reporter;
    if coalesce(btrim(pr.nick), '') = '' then raise exception 'Спершу вибери нік акаунта.'; end if;
    if new.character_id is null then
      select count(*) into n from public.characters where owner = new.reporter;
      if n = 0 then raise exception 'Спершу додай персонажа.'; end if;
      if n > 1 then raise exception 'Обери персонажа, з якого вписуєш ціну.'; end if;
      new.character_id := (select id from public.characters where owner = new.reporter);
    end if;
    select * into ch from public.characters where id = new.character_id;
    if not found or ch.owner <> new.reporter then raise exception 'Цей персонаж не твій.'; end if;
    if ch.static_id is null then raise exception 'Вкажи статік персонажа %.', ch.name; end if;
  end if;
  if (not staff or new.source = 'desktop') and bi.min_price > 0 and bi.max_price > bi.min_price
     and (new.price < bi.min_price * 0.9 or new.price > bi.max_price * 1.1) then
    raise exception 'Ціна % $ поза межами скупника (% – % $). Перевір число.', new.price, bi.min_price, bi.max_price;
  end if;
  if not staff and (select count(*) from public.price_reports
                    where reporter = new.reporter and created_at > now() - interval '1 hour') >= 120 then
    raise exception 'Забагато внесень за годину. Спробуй трохи пізніше.';
  end if;
  new.created_at := now();
  new.cycle := null;
  -- виправлення: своє внесення того ж товару за останні 10 хв замінюється новим
  delete from public.price_reports
    where kind = 'buyer' and reporter = new.reporter and buyer_id = new.buyer_id and item_id = new.item_id
      and created_at > now() - interval '10 minutes';
  if found then return new; end if;
  if new.price = bi.price and bi.price_at > now() - interval '30 minutes' then
    raise exception 'Ця ціна вже актуальна — її оновили менше ніж 30 хв тому.';
  end if;
  return new;
end $$;

-- час наступної зміни цін (0009): вписує акаунт з ніком і персонажем зі статіком
create or replace function public.set_next_change(p_buyer text, p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare pr public.profiles;
begin
  if auth.uid() is null then raise exception 'Спершу увійди через Discord.'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if coalesce(btrim(pr.nick), '') = '' then raise exception 'Спершу вибери нік акаунта.'; end if;
  if not exists (select 1 from public.characters where owner = auth.uid() and static_id is not null) then
    raise exception 'Спершу додай персонажа зі статіком.';
  end if;
  if p_at <= now() or p_at > now() + interval '24 hours' then
    raise exception 'Час наступної зміни має бути в найближчі 24 години.';
  end if;
  update public.buyers set next_change_at = p_at, next_change_by = auth.uid() where id = p_buyer;
  if not found then raise exception 'Немає такого скупника.'; end if;
end $$;

-- ---------- публічні зведення: нік, без статіку ----------
-- стовпці прибираються, тож create or replace не підходить
drop view if exists public.price_updates;
create view public.price_updates as
select r.id, r.buyer_id, r.item_id, r.price, r.created_at, r.cycle,
       r.reporter as reporter_id, coalesce(nullif(btrim(p.nick), ''), p.name) as reporter_name, c.name as reporter_character
from public.price_reports r
join public.profiles p on p.id = r.reporter
left join public.characters c on c.id = r.character_id
where r.kind = 'buyer';

-- рейтинг — на акаунт: ціни з усіх його персонажів в одну суму
drop view if exists public.contributors;
create view public.contributors as
select p.id, coalesce(nullif(btrim(p.nick), ''), p.name) as name, p.avatar_url,
       count(*) filter (where r.created_at > now() - interval '7 days') as week,
       count(*) as total,
       max(r.created_at) as last_at,
       count(*) filter (where r.created_at > now() - interval '1 month') as month,
       count(*) filter (where r.created_at > now() - interval '1 year') as year
from public.price_reports r join public.profiles p on p.id = r.reporter
where r.kind = 'buyer'
group by p.id, p.nick, p.name, p.avatar_url;

drop view if exists public.buyer_next_change;
create view public.buyer_next_change as
select b.id as buyer_id, b.next_change_at, p.nick
from public.buyers b left join public.profiles p on p.id = b.next_change_by;

-- власник мітки на мапі — персонаж зі статіком на мітці (статік на мітці й так публічний)
create or replace view public.map_owners as
select distinct c.static_id, c.name as game_name
from public.characters c join public.map_points m on m.owner_static = c.static_id
where c.static_id is not null;

grant select on public.price_updates, public.contributors, public.buyer_next_change, public.map_owners to anon, authenticated;

-- ---------- перенесення наявних даних ----------
-- статік профілю → персонажу з тим самим ім'ям, інакше найстаршому; лише якщо статік ще ніхто не має
update public.characters c set static_id = p.static_id
from public.profiles p
where c.owner = p.id and p.static_id is not null and c.static_id is null
  and c.id = coalesce(
    (select x.id from public.characters x where x.owner = p.id and x.name = p.game_name order by x.created_at limit 1),
    (select x.id from public.characters x where x.owner = p.id order by x.created_at limit 1))
  and not exists (select 1 from public.characters y where y.static_id = p.static_id);

-- ціни → персонаж автора зі статіком, інакше найстарший
update public.price_reports r set character_id = coalesce(
    (select c.id from public.characters c where c.owner = r.reporter and c.static_id is not null order by c.created_at limit 1),
    (select c.id from public.characters c where c.owner = r.reporter order by c.created_at limit 1))
where r.character_id is null;
