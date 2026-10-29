#!/usr/bin/env bash
# Накочує міграції на тимчасовий локальний Postgres з імітацією Supabase і проганяє rls_test.sql.
set -euo pipefail
cd "$(dirname "$0")/../.."
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=$(mktemp -d); PORT=${PGPORT_TEST:-55432}
# initdb не запускається від root — тоді сервер працює від користувача postgres
AS=(); if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; AS=(runuser -u postgres --); fi
"${AS[@]}" "$BIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
trap '"${AS[@]}" "$BIN/pg_ctl" -D "$DIR" stop -m fast >/dev/null; rm -rf "$DIR"' EXIT
P="psql -X -q -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1"
$P <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- мінімальна імітація Supabase Storage: таблиці, на які посилаються міграції
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
SQL
for f in supabase/migrations/*.sql; do $P -f "$f"; done
# Supabase видає ці права за замовчуванням; без них тест не відображав би реальної поведінки
$P -c "grant usage on schema public to anon, authenticated;
       grant select, insert, update, delete on all tables in schema public to anon, authenticated;
       revoke update on public.profiles from anon, authenticated;
       grant update (name, avatar_url, static_id, game_name) on public.profiles to authenticated;
       grant select on public.prices_confirmed to anon, authenticated;"
$P -f supabase/tests/rls_test.sql
$P -f supabase/seed/catalog_from_hub.sql
$P -f supabase/seed/catalog_from_hub.sql   # повторний запуск нічого не дублює
$P -f supabase/seed/history_from_hub.sql
$P -f supabase/seed/history_from_hub.sql   # і тут повтор без дублів
$P -f supabase/seed/limits_from_hub.sql
$P -f supabase/seed/limits_from_hub.sql
$P -f supabase/tests/catalog_test.sql
$P -f supabase/tests/player_prices_test.sql
$P -f supabase/tests/map_test.sql
$P -f supabase/seed/vehicles.sql >/dev/null; $P -f supabase/seed/vehicles.sql >/dev/null   # шаблон транспорту: повтор без дублів
$P -c "do \$\$ begin assert (select count(*) from public.vehicles) = 4, 'шаблон транспорту дублюється'; assert (select exclusive and salon_price is null and fuel = 'petrol' from public.vehicles where name = 'Karin Priu'), 'ексклюзив або двигун не записався'; end \$\$;"
echo 'Шаблон транспорту ok'
$P -f supabase/seed/vehicles_marketplace.sql >/dev/null; $P -f supabase/seed/vehicles_marketplace.sql >/dev/null   # транспорт з маркетплейсу: повтор без дублів
$P -c "do \$\$ begin assert (select count(*) from public.vehicles) = 78, 'транспорт з маркетплейсу дублюється'; assert (select kind = 'moto' and brand = 'Shitzu' from public.vehicles where name = 'Shitzu Ninja ZX-10R'), 'тип або марка не записались'; end \$\$;"
echo 'Транспорт з маркетплейсу ok'
$P -f supabase/seed/vehicles_marketplace_2.sql >/dev/null; $P -f supabase/seed/vehicles_marketplace_2.sql >/dev/null   # друга партія маркетплейсу: повтор без дублів
$P -c "do \$\$ begin assert (select count(*) from public.vehicles) = 129, 'друга партія маркетплейсу дублюється'; assert (select kind = 'boat' and brand = 'Shitzu' from public.vehicles where name = 'Shitzu Squalo'), 'човен не записався'; end \$\$;"
echo 'Друга партія маркетплейсу ok'
$P -f supabase/seed/map_quantfun.sql >/dev/null; $P -f supabase/seed/map_quantfun.sql >/dev/null   # мітки з QuantFun: повтор без дублів
$P -c "do \$\$ begin assert (select count(*) from public.map_points where created_by is null) = 2149, 'мітки з QuantFun дублюються або не всі'; assert (select icon from public.map_points where name = 'Odesa Mafia') = '/icons/map/mafia-odesa.svg', 'іконка мафії не записалась'; assert not (select bool_or(show_label) from public.map_points where category_id = 'bombs'), 'масові мітки з підписами'; end \$\$;"
echo 'Мітки з QuantFun ok'
$P -f supabase/tests/map_drafts_test.sql
$P -f supabase/tests/map_areas_test.sql
$P -f supabase/seed/map_hunting_fields.sql; $P -f supabase/seed/map_hunting_fields.sql   # поля полювання: повтор без дублів
$P -c "do \$\$ begin assert (select count(*) from public.map_areas where category_id = 'hunting-fields') = 6, 'поля полювання дублюються або не всі'; assert (select shown = false and grp = 'Шари мапи' from public.map_categories where id = 'hunting-fields'), 'поля полювання не в шарах мапи'; end \$\$;"
echo 'Поля полювання ok'
$P -f supabase/tests/app_online_test.sql
$P -f supabase/tests/buyer_unknown_items_test.sql
$P -f supabase/tests/buyer_limit_reports_test.sql
$P -f supabase/tests/site_promo_test.sql
$P -f supabase/tests/site_stats_test.sql
$P -f supabase/tests/map_batches_test.sql
$P -f supabase/seed/map_pumpkins_ohm.sql >/dev/null; $P -f supabase/seed/map_pumpkins_ohm.sql >/dev/null   # гарбузи: повтор без дублів
$P -c "do \$\$ begin assert (select count(*) from public.map_points where category_id = 'harbuzy' and source = 'ohm') = 790, 'гарбузів не 790 або дублюються'; assert (select count(*) = 1 and not bool_or(published) from public.map_batches where source = 'ohm'), 'партія гарбузів не одна або вже опублікована'; end \$\$;"
echo 'Гарбузи ok'
$P -f supabase/tests/guides_test.sql
