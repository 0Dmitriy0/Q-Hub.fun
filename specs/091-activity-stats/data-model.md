# Data Model: Статистика активності й сповіщення

Міграції ідемпотентні, по етапах поставки: `0075_activity_stats.sql` (події, налаштування, топ), `0076_activity_exclusions.sql`, `0077_notifications.sql`, `0078_notifications_dm.sql`, `0079_activity_settings_rpc.sql`. Залежить від 0004, 0019, 0055, 0057, 0059, 0060, 0061, 0065.

## activity_events — єдина таблиця подій

| Поле | Тип | Правила |
|---|---|---|
| id | bigint identity PK | |
| user_id | uuid → profiles(id) on delete cascade | автор внеску |
| category | text | `prices` \| `marks` \| `guides` (check; нова категорія — розширення check) |
| entity_id | text null | опублікований об'єкт: id звіту ціни / `map_points.id` / `wiki_guides.id`; null, поки не опубліковано |
| created_at | timestamptz | час подачі в джерелі |
| status | text | `pending` \| `counted` \| `rejected` \| `removed` |
| source | text | `price_reports` \| `map_drafts` \| `wiki_proposals` |
| source_id | text | id рядка джерела; **unique (source, source_id)** |
| group_key | text null | для `prices` — `buyer_id\|item_id`; інакше null |
| updated_at | timestamptz default now() | |

Індекси: `(category, created_at)` — основний, як просить власник; `(user_id, category, created_at)` — список внесків гравця; `(category, entity_id)` — для тригерів сховання й видалення об'єкта.

RLS: select — лише `is_admin()`; insert/update/delete — немає політик (пишуть тільки тригери `security definer`).

### Переходи статусу

```
pending ──прийнято + об'єкт видимий──▶ counted ──сховано/видалено/партія знята──▶ removed
   │                                     ▲                                          │
   └──відхилено/відкликано──▶ rejected   └────────────повернуто (unhide)────────────┘
```

Джерело видалено повністю (наприклад, `price_reports` delete або каскад акаунта) → `removed`. Подію видаленого акаунта прибирає каскад `user_id`.

### Тригери (усі `after`, `security definer`, `set search_path = ''`)

- `price_reports` insert/update (kind = `buyer`) → upsert `counted`; delete → `removed`.
- `map_drafts` insert/update status → upsert за мапою з research R4.
- `wiki_proposals` insert/update status (section in `map_point`, `guide`; kind = `new`) → upsert.
- `map_points` update `hidden`/`batch_id`, delete → перерахунок подій з `category = 'marks' and entity_id = id`.
- `map_batches` update (публікація партії) → перерахунок подій міток цієї партії.
- `wiki_guides` update `hidden`, delete → перерахунок подій `guides`.

Уся логіка «який статус має подія» — в одній функції `activity_event_state(source, source_id)`. Її використовують і тригери, і `activity_sync_all()`, тож розійтися вони не можуть.

## activity_settings — одна строка

| Поле | Тип | Правила |
|---|---|---|
| id | boolean PK default true check (id) | одна строка |
| price_daily_limit | int default 1 | 1…50 |
| excluded_roles | text[] default `{admin,moderator}` | кожен елемент у `user/editor/moderator/admin` |
| updated_by | uuid → profiles | |
| updated_at | timestamptz | |

RLS: select/update — `is_admin()`. Зміна — RPC `activity_settings_set` з перевіркою меж.

## activity_exclusions

| Поле | Тип | Правила |
|---|---|---|
| id | bigint identity PK | |
| event_id | bigint null → activity_events(id) on delete cascade | виключення внеску |
| user_id | uuid null → profiles(id) on delete cascade | виключення гравця |
| period_from, period_to | date null | для гравця: дні за Києвом включно; для внеску — null |
| reason | text | 3…300 символів, обов'язково |
| created_by, created_at | uuid, timestamptz | |
| revoked_by, revoked_at | uuid null, timestamptz null | скасування; запис не видаляється (історія, FR-017) |

Check: рівно одне з `event_id` / `user_id`; для `user_id` обидві дати задані й `period_from <= period_to`. Унікальність активного: `unique (event_id) where revoked_at is null`, `unique (user_id, period_from, period_to) where revoked_at is null`.

Діє на підрахунок: внесок виключений, якщо є активний запис з його `event_id`, **або** активне виключення його автора, чий проміжок покриває київську дату внеску.

## notifications

| Поле | Тип | Правила |
|---|---|---|
| id | uuid PK | приходить з клієнта (`client_id`), тож повторне «Надіслати» не створює дубль (FR-031) |
| recipient | uuid → profiles(id) on delete cascade | |
| sender | uuid → profiles(id) on delete set null | адмін |
| title | text | 1…120 |
| body | text | 1…1500 (DM з заголовком і призом вміщається в 2000) |
| category | text | `prices` \| `marks` \| `guides` \| `other` |
| prize | text default '' | ≤ 200 |
| place | int null | 1…10, якщо з топу |
| period_from, period_to | date null | якщо з топу |
| created_at | timestamptz default now() | |
| read_at | timestamptz null | ставить лише отримувач |
| discord_status | text default `queued` | `queued` \| `sent` \| `failed` |
| discord_error | text default '' | ≤ 300, людською мовою |
| discord_attempts | int default 0 | ≤ 5 |
| discord_next_at | timestamptz default now() | для повторів |
| discord_sent_at | timestamptz null | |

Індекси: `(recipient, created_at desc)`; частковий `(recipient) where read_at is null` — для лічильника; частковий `(discord_next_at) where discord_status = 'queued'` — для бота.

RLS:
- select — `recipient = auth.uid()` або `is_admin()`;
- insert/update/delete напряму — немає політик. Надсилання — `notification_send` (admin), прочитання — `notification_read(id)` і `notifications_read_all()` (змінюють лише `read_at` власних рядків), статус Discord — лише service role (бот).
