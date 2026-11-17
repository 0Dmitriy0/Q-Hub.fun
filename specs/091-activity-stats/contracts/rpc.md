# Контракт: RPC бази (Supabase, schema `public`)

Усі функції — `security definer`, `set search_path = ''`. Функції адміна першим рядком перевіряють `public.is_admin()` і на відмову кидають `42501` («лише для адміна»). Дати — `date` за київським часом, межі включно.

## Статистика (лише admin)

| Функція | Вхід | Вихід | Помилки |
|---|---|---|---|
| `activity_top(p_from date, p_to date, p_limit int default 10)` | період ≤ 366 днів, `p_from <= p_to` | `table(category text, place int, user_id uuid, nick text, cnt int, reached_at timestamptz)` — до `p_limit` рядків на категорію | `42501`; `22023` поганий період |
| `activity_user_events(p_user uuid, p_from date, p_to date, p_category text default null)` | | `table(event_id bigint, category, entity_id, title text, link text, created_at, status, counted boolean, reason text, exclusion_id, exclusion_reason, excluded_by, excluded_at)`; `title` — «товар — скупник» / назва мітки / назва гайду; `link` — `/tsiny`, `/mapa#x,y,7`, `/wiki/gaidy/<id>`; `reason` ∈ `over_daily_limit`, `excluded`, `player_excluded`, `role_excluded`, `pending`, `rejected`, `removed`, `null` | `42501` |
| `activity_exclude_event(p_event bigint, p_reason text)` | причина 3…300 | `bigint` id виключення; повтор активного — повертає наявний | `42501`, `22023` |
| `activity_exclude_user(p_user uuid, p_from date, p_to date, p_reason text)` | | `bigint` | `42501`, `22023` |
| `activity_unexclude(p_exclusion bigint)` | | `void` (ставить `revoked_*`) | `42501`; `P0002` не знайдено |
| `activity_exclusions_list(p_from date, p_to date)` | | активні й скасовані з автором, часом і причиною | `42501` |
| `activity_settings_get()` | | `(price_daily_limit int, excluded_roles text[])` | `42501` |
| `activity_settings_set(p_price_daily_limit int, p_excluded_roles text[])` | 1…50; ролі з фіксованого переліку | `void` | `42501`, `22023` |
| `activity_resync()` | | `int` — скільки подій змінено звіркою з джерелами | `42501` |

`nick` — `profiles.nick` (trim). Порожній нік → `null`, інтерфейс показує «без ніку». Ім'я з Discord не повертається ніколи.

Ранжування в `activity_top`: `cnt desc, reached_at asc, user_id` (останнє — лише для стабільності).

## Сповіщення

| Функція | Хто | Вхід | Вихід |
|---|---|---|---|
| `notification_send(p_id uuid, p_recipient uuid, p_title text, p_body text, p_category text, p_prize text, p_place int, p_from date, p_to date)` | admin | межі з data-model | `uuid`; повтор з тим самим `p_id` повертає той самий id без дубля |
| `notifications_admin_list(p_limit int default 100, p_before timestamptz default null)` | admin | | історія: отримувач (нік), відправник (нік), заголовок, категорія, приз, `created_at`, `read_at`, `discord_status`, `discord_error` |
| `notification_read(p_id uuid)` | отримувач | | `void`; чужий id — нічого не змінює (0 рядків), без витоку факту існування |
| `notifications_read_all()` | будь-хто з входом | | `int` — скільки позначено |
| `profiles_search_nick(p_q text)` | admin | ≥ 2 символи | до 20 `(id, nick)` — вибір отримувача вручну |

Пряме читання: `select … from notifications where recipient = auth.uid()` (RLS). Лічильник — `select count(*) … read_at is null` з `head: true`.

## Лише для бота (service_role)

| Функція | Вихід |
|---|---|
| `notification_dm_batch(p_limit int default 20)` | черга `queued` з `discord_next_at <= now()`, разом з `discord_user_id` з `auth.identities`; рядки блокуються `for update skip locked` |
| `notification_dm_result(p_id uuid, p_status text, p_error text)` | `p_status` ∈ `sent`, `retry`, `failed`; `retry` збільшує `attempts` і зсуває `next_at`, після 5-ї спроби — `failed` |

anon і authenticated не мають `execute` на ці функції.
