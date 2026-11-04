# Data Model: Discord-бот (060)

Міграція `supabase/migrations/0052_discord_bot.sql`, ідемпотентна. Усі таблиці — RLS лише `public.is_admin()`
(select / insert / update / delete); функція працює з service role.

## `public.discord_bot` (1 рядок, `id boolean primary key default true check (id)`)

| Колонка | Тип | Правило |
|---|---|---|
| `guild_id` | text | `'' or ~ '^\d{17,20}$'` |
| `prices_channel_id` | text | те саме |
| `news_channel_id` | text | те саме |
| `prices_on` | boolean not null default false | публікувати ціни |
| `news_on` | boolean not null default false | публікувати новини |
| `window_min` | int not null default 5 | 1–60 (вікно збирання, R3) |
| `crosspost_per_hour` | int not null default 10 | 1–50 (ліміт, R3) |
| `last_ok_at` | timestamptz | остання успішна дія з Discord (стан «на зв'язку») |
| `last_error` | text not null default '' | ≤ 500, остання помилка для адмінки |

## `public.discord_outbox` (події цін)

| Колонка | Тип | Правило |
|---|---|---|
| `id` | bigint identity pk | |
| `buyer_id` | text not null | FK `buyers on delete cascade` |
| `item_id` | bigint not null | FK `items on delete cascade` |
| `price` | bigint not null | нова ціна |
| `prev_price` | bigint | попередня з `price_history` (null — «нове») |
| `at` | timestamptz not null | час зміни |
| `post_key` | text | ключ публікації, у яку потрапила подія (null — ще в черзі) |
| `posted_at` | timestamptz | |

Наповнює тригер `after insert on price_history` (security definer), лише коли `discord_bot.prices_on`. Індекс
`(post_key) where post_key is null`.

## `public.discord_posts` (журнал публікацій — проти дублів і для ліміту)

| Колонка | Тип | Правило |
|---|---|---|
| `key` | text pk | `prices:<id>[:частина]`, `news:<draft id>`, `test:<час>` |
| `channel_id` | text not null | |
| `message_id` | text | id повідомлення в Discord |
| `crossposted` | boolean not null default false | |
| `status` | text not null | `in ('sending','sent','failed')` |
| `error` | text not null default '' | ≤ 500 |
| `created_at` | timestamptz not null default now() | |

## `public.news_drafts`

| Колонка | Тип | Правило |
|---|---|---|
| `id` | bigint identity pk | |
| `source_ref` | text not null unique | `changelog:<id>`, `site:<id>`, `manual:<uuid>`, `merged:<ids>` |
| `title` | text not null | 1–120 |
| `added` / `changed` / `removed` | text[] not null default '{}' | пункти мовою гравця, кожен ≤ 300 |
| `image_url` | text not null default '' | `'' or ~ '^https://'` |
| `link` | text not null default '' | `'' or ~ '^https://'` |
| `status` | text not null default `'draft'` | `in ('draft','sent','skipped','merged')` |
| `sent_at` | timestamptz | |
| `created_at` | timestamptz not null default now() | |

Перехід станів: `draft → sent` (кнопка «Надіслати», один раз — ключ `news:<id>` у `discord_posts`), `draft → skipped`
(«Не публікувати»), `draft → merged` (вибрані дрібні чернетки → нова `merged:…`).

## `src/data/sitenews.json` (новий)

Той самий формат, що `changelog.json` (`id` — дата, `added / changed / fixed` пунктами мовою гравця), але лише про сайт.
`fixed` у новині показується як «Змінено».
