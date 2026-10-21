-- Q-Hub: початкова схема.
-- Особисті дані (облік, угоди, склад, гараж) прив'язані до персонажа, а персонаж — до акаунта.
-- Доступ перевіряє сама база (Row Level Security): навіть з публічним ключем чужі дані не прочитати.
-- Спільний каталог і підтверджені ціни читають усі; змінюють лише редактори.

-- ---------- акаунти ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'editor', 'moderator', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- роль поточного користувача; security definer, щоб правила не впирались у RLS самої profiles
create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'anon')
$$;
create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.my_role() in ('editor', 'moderator', 'admin') $$;

-- ---------- персонажі ----------
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  start_balance bigint not null default 0,
  goal_name text not null default '',
  goal bigint not null default 0 check (goal >= 0),
  created_at timestamptz not null default now()
);
create index on public.characters (owner);

create or replace function public.owns_character(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.characters where id = cid and owner = auth.uid())
$$;

-- ---------- облік ----------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters on delete cascade,
  type text not null check (type in ('in', 'out')),
  amount bigint not null check (amount > 0),
  category text not null default 'Інше' check (char_length(category) <= 30),
  note text not null default '' check (char_length(note) <= 200),
  source text not null default 'manual' check (source in ('manual', 'deal', 'desktop', 'import', 'reconcile')),
  ts timestamptz not null default now(),
  external_id text,                        -- id з хабу при імпорті: повторний імпорт не дублює записи
  unique (character_id, external_id)
);
create index on public.transactions (character_id, ts desc);

-- ---------- угоди й чеки ----------
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters on delete cascade,
  op text not null check (op in ('buy', 'farm', 'sell')),
  item text not null check (char_length(item) between 1 and 80),
  qty numeric(14, 2) not null check (qty > 0),
  price bigint not null default 0 check (price >= 0),    -- за одиницю
  category text not null default '',                    -- '' = ресурси скупників; інакше категорія ринку
  receipt_id uuid,                                       -- кілька товарів одним чеком
  tx_id uuid references public.transactions on delete set null,
  ts timestamptz not null default now(),
  external_id text,
  unique (character_id, external_id)
);
create index on public.deals (character_id, ts);

-- ---------- гараж, документи, ігрові сесії ----------
create table public.cars (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  plate text not null default '' check (char_length(plate) <= 16),
  gov bigint not null default 0 check (gov >= 0),
  paid bigint not null default 0 check (paid >= 0),
  tune text not null default '',
  tuning jsonb not null default '{}',
  note text not null default '',
  status text not null default 'own' check (status in ('own', 'sold')),
  sold_price bigint not null default 0,
  sold_to text not null default 'player' check (sold_to in ('player', 'state')),
  sold_at timestamptz,
  pos int not null default 0,
  created_at timestamptz not null default now(),
  external_id text,
  unique (character_id, external_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default '',
  expires date,
  external_id text,
  unique (character_id, external_id)
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  external_id text,
  unique (character_id, external_id),
  check (ended_at is null or ended_at >= started_at)
);

-- ---------- спільний каталог ----------
create table public.categories (
  key text primary key,
  name text not null,
  sort int not null default 0
);

create table public.buyers (
  id text primary key,
  name text not null,
  sort int not null default 0,
  updated_at timestamptz                   -- коли ціни цього скупника востаннє підтвердили
);

create table public.items (
  id bigint generated always as identity primary key,
  name text not null unique,
  category text not null references public.categories (key),
  sub text not null default '',
  unit text not null default 'шт',
  gov bigint not null default 0,
  aliases text[] not null default '{}'
);

create table public.buyer_items (
  buyer_id text not null references public.buyers on delete cascade,
  item_id bigint not null references public.items on delete cascade,
  min_price bigint not null default 0,
  max_price bigint not null default 0,
  primary key (buyer_id, item_id)
);

-- сирі повідомлення гравців про ціни; публічно видно лише підтверджене (prices_confirmed)
create table public.price_reports (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.items on delete cascade,
  buyer_id text references public.buyers on delete cascade,
  kind text not null check (kind in ('buyer', 'sell', 'buy', 'sold', 'rent')),
  price bigint not null check (price > 0),
  price_hi bigint check (price_hi is null or price_hi >= price),
  reporter uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  source text not null default 'player' check (source in ('player', 'discord', 'desktop')),
  created_at timestamptz not null default now()
);
create index on public.price_reports (item_id, buyer_id, kind, created_at desc);

-- підтверджена ціна: ≥3 різні гравці за 48 год; медіана після відкидання викидів (поза 0,5–2× від сирої медіани).
-- Подання навмисно працює з правами власника (не security_invoker): назовні йдуть лише агрегати, без авторів звітів.
create view public.prices_confirmed as
with recent as (
  select item_id, buyer_id, kind, reporter, price, created_at
  from public.price_reports
  where created_at > now() - interval '48 hours'
), med as (
  select item_id, buyer_id, kind, percentile_cont(0.5) within group (order by price) as raw_med
  from recent group by item_id, buyer_id, kind
), clean as (
  select r.* from recent r
  join med m on m.item_id = r.item_id and m.kind = r.kind and m.buyer_id is not distinct from r.buyer_id
  where r.price between m.raw_med * 0.5 and m.raw_med * 2
)
select item_id, buyer_id, kind,
       round(percentile_cont(0.5) within group (order by price))::bigint as price,
       count(distinct reporter) as reporters,
       max(created_at) as updated_at
from clean
group by item_id, buyer_id, kind
having count(distinct reporter) >= 3;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.transactions enable row level security;
alter table public.deals enable row level security;
alter table public.cars enable row level security;
alter table public.documents enable row level security;
alter table public.game_sessions enable row level security;
alter table public.categories enable row level security;
alter table public.buyers enable row level security;
alter table public.items enable row level security;
alter table public.buyer_items enable row level security;
alter table public.price_reports enable row level security;

create policy "свій профіль" on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "змінити своє ім'я" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- роль сам собі не підвищиш: гравцям дозволено змінювати лише ім'я та аватар
revoke update on public.profiles from anon, authenticated;
grant update (name, avatar_url) on public.profiles to authenticated;

create policy "свої персонажі" on public.characters for all
  using (owner = auth.uid()) with check (owner = auth.uid());

create policy "облік персонажа" on public.transactions for all
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));
create policy "угоди персонажа" on public.deals for all
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));
create policy "гараж персонажа" on public.cars for all
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));
create policy "документи персонажа" on public.documents for all
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));
create policy "сесії персонажа" on public.game_sessions for all
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));

create policy "каталог читають усі" on public.categories for select using (true);
create policy "скупників читають усі" on public.buyers for select using (true);
create policy "товари читають усі" on public.items for select using (true);
create policy "ціни скупників читають усі" on public.buyer_items for select using (true);
create policy "каталог змінюють редактори" on public.categories for all using (public.is_staff()) with check (public.is_staff());
create policy "скупників змінюють редактори" on public.buyers for all using (public.is_staff()) with check (public.is_staff());
create policy "товари змінюють редактори" on public.items for all using (public.is_staff()) with check (public.is_staff());
create policy "ціни скупників змінюють редактори" on public.buyer_items for all using (public.is_staff()) with check (public.is_staff());

create policy "повідомити ціну" on public.price_reports for insert to authenticated with check (reporter = auth.uid());
create policy "свої повідомлення або модератор" on public.price_reports for select using (reporter = auth.uid() or public.is_staff());
create policy "модератор видаляє" on public.price_reports for delete using (public.is_staff());

grant select on public.prices_confirmed to anon, authenticated;

-- ---------- стартові категорії (як у хабі) ----------
insert into public.categories (key, name, sort) values
  ('res', 'Ресурси', 0), ('trans', 'Транспорт', 1), ('moto', 'Мото', 2), ('tune', 'Тюнінг', 3),
  ('plate', 'Номери', 4), ('rent', 'Оренда', 5), ('cloth', 'Одяг', 6), ('acc', 'Аксесуари', 7), ('other', 'Інше', 8);
