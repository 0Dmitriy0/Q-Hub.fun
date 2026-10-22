-- Q-Hub: мапа — категорії міток і самі мітки. Бачать усі, додає й змінює лише адмін.
-- Координати — метри гри (X схід, Y північ), як показує мапа під курсором.

create table if not exists public.map_categories (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (length(name) between 1 and 120),
  grp text not null default 'Інше' check (length(grp) between 1 and 120),
  icon text not null default '',
  color text not null default '#ff6a1f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort integer not null default 100,
  shown boolean not null default true,     -- чи увімкнена категорія для того, хто відкрив мапу вперше
  created_at timestamptz not null default now()
);

create table if not exists public.map_points (
  id bigint generated always as identity primary key,
  category_id text not null references public.map_categories (id) on delete cascade on update cascade,
  name text not null default '' check (length(name) <= 160),
  note text not null default '' check (length(note) <= 600),
  x double precision not null check (x between -6000 and 6800),
  y double precision not null check (y between -4400 and 8500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists map_points_category on public.map_points (category_id);

-- власник бізнесу на мітці (магазин, АЗС тощо): статік персонажа; файл можна запускати повторно
alter table public.map_points add column if not exists owner_static integer check (owner_static between 1 and 999999999);
-- своя іконка окремої мітки (напр. банда в категорії «Банди»); порожньо — іконка категорії
-- чи писати назву мітки під нею на мапі (для дрібних міток на кшталт баків підпис зайвий)
alter table public.map_points add column if not exists show_label boolean not null default true;
alter table public.map_points add column if not exists icon text check (length(icon) <= 300 and icon ~ '^(/icons/|https://)[^\s"''<>]+$');

-- нік власника для мапи: лише ті профілі, чий статік стоїть на якійсь мітці, і лише нік зі статіком
create or replace view public.map_owners as
select distinct p.static_id, p.game_name
from public.profiles p join public.map_points m on m.owner_static = p.static_id
where p.static_id is not null;
grant select on public.map_owners to anon, authenticated;

alter table public.map_categories enable row level security;
alter table public.map_points enable row level security;
drop policy if exists "map_categories: read all" on public.map_categories;
drop policy if exists "map_categories: admin write" on public.map_categories;
drop policy if exists "map_points: read all" on public.map_points;
drop policy if exists "map_points: admin write" on public.map_points;
create policy "map_categories: read all" on public.map_categories for select using (true);
create policy "map_categories: admin write" on public.map_categories for all using (public.is_admin()) with check (public.is_admin());
create policy "map_points: read all" on public.map_points for select using (true);
create policy "map_points: admin write" on public.map_points for all using (public.is_admin()) with check (public.is_admin());

-- початкові категорії (без міток): адмін додає мітки сам; роботи й скупники сайт малює зі своїх даних
insert into public.map_categories (id, name, grp, icon, sort, shown) values
  ('shop-247', '24/7', 'Магазини', '/icons/map/shop-247.svg', 10, true),
  ('barber', 'Барбершопи', 'Магазини', '/icons/map/barber.svg', 11, true),
  ('bar', 'Бари', 'Магазини', '/icons/junk/beer.svg', 12, true),
  ('guns', 'Зброя', 'Магазини', '/icons/map/guns.svg', 13, true),
  ('clothes', 'Одяг', 'Магазини', '/icons/map/clothes.svg', 14, true),
  ('tattoo', 'Салони татуювань', 'Магазини', '/icons/map/tattoo.svg', 15, true),
  ('clothes-family', 'Сімейний одяг', 'Магазини', '/icons/map/clothes-family.svg', 16, true),
  ('masks', 'Магазини масок', 'Магазини', '/icons/map/masks.svg', 17, true),
  ('clothes-real', 'Реальний одяг', 'Магазини', '/icons/map/clothes-real.svg', 18, true),
  ('gangs', 'Банди', 'Структури', '/icons/map/gangs.svg', 20, true),
  ('gov', 'Державні структури', 'Структури', '/icons/map/gov.svg', 21, true),
  ('mafia', 'Мафії', 'Структури', '/icons/map/mafia.svg', 22, true),
  ('spawn', 'Початкові локації', 'Структури', '/icons/map/spawn.svg', 23, true),
  ('school', 'Школи', 'Структури', '/icons/map/school.svg', 24, true),
  ('ls-customs', 'LS Customs', 'Транспорт', '/icons/jobs/mechanic.svg', 30, true),
  ('air-salon', 'Авіасалони', 'Транспорт', '/icons/map/air-salon.svg', 31, true),
  ('car-market', 'Авторинки', 'Транспорт', '/icons/map/car-market.svg', 32, true),
  ('car-salon', 'Автосалони', 'Транспорт', '/icons/map/car-salon.svg', 33, true),
  ('gas', 'Заправки', 'Транспорт', '/icons/fuel/benzyn.svg', 34, true),
  ('charge', 'Зарядні станції', 'Транспорт', '/icons/map/charge.svg', 35, true),
  ('other-salon', 'Інші салони', 'Транспорт', '/icons/map/boat.svg', 36, true),
  ('rent', 'Оренда', 'Транспорт', '/icons/map/rent.svg', 37, true),
  ('casino', 'Казино', 'Розваги', '/icons/map/casino.svg', 40, true),
  ('cinema', 'Кінотеатри', 'Розваги', '/icons/map/cinema.svg', 41, true),
  ('metals', 'Місця видобутку дорогоцінних металів', 'Заробіток', '/icons/metal/gold.svg', 50, true),
  ('fishing', 'Місця для риболовлі', 'Заробіток', '/icons/jobs/fisher.svg', 51, true),
  ('water', 'Апарати з водою', 'Вендингові апарати', '/icons/junk/mineral-water.svg', 60, false),
  ('food', 'Апарати з їжею', 'Вендингові апарати', '/icons/junk/chocolate.svg', 61, false),
  ('bombs', 'Вибухові пристрої', 'Міні-ігри, квести й контракти', '/icons/map/bomb.svg', 70, false),
  ('graffiti', 'Графіті', 'Міні-ігри, квести й контракти', '/icons/junk/spray-can.svg', 71, false),
  ('oil', 'Нафтокачки', 'Міні-ігри, квести й контракти', '/icons/map/oil.svg', 72, false),
  ('ufo-sea', 'НЛО в океані', 'Міні-ігри, квести й контракти', '/icons/map/ufo.svg', 73, false),
  ('ufo-land', 'НЛО у штаті', 'Міні-ігри, квести й контракти', '/icons/map/ufo.svg', 74, false),
  ('gifts', 'Подарунки', 'Міні-ігри, квести й контракти', '/icons/map/gift.svg', 75, false),
  ('ghosts', 'Привиди', 'Міні-ігри, квести й контракти', '/icons/map/ghost.svg', 76, false),
  ('trash-bins', 'Сміттєві баки', 'Міні-ігри, квести й контракти', '/icons/jobs/garbage.svg', 77, false),
  ('trash-bags', 'Сміттєві пакети', 'Міні-ігри, квести й контракти', '/icons/jobs/junk.svg', 78, false),
  ('car-theft', 'Спавни автоугонок', 'Міні-ігри, квести й контракти', '/icons/jobs/carthief.svg', 79, false)
on conflict (id) do nothing;
