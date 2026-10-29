# Data Model: Нік акаунта й персонажі зі своїм статіком

Міграція: `supabase/migrations/0038_account_nick_characters.sql` (0037 зайнято планом specs/010 — `rule_sources`).

## profiles (зміни)

| Поле | Тип | Правила |
|---|---|---|
| `nick` | text, null | `^[A-Za-z0-9_]{3,20}$`; унікальний `lower(nick)`; оновлює лише власник (`grant update (nick)`) |
| `nick_changed_at` | timestamptz, null | ставить тригер; зміна `nick` не частіше раз на 30 днів, якщо старий не null (крім `admin`) |
| `game_name`, `static_id` | без змін | **більше не читаються**; лишаються для відкату, видаляються окремою міграцією згодом |

## characters (зміни)

| Поле | Тип | Правила |
|---|---|---|
| `name` | text | + `check (name ~ '^[A-Z][a-zA-Z]{1,14}_[A-Z][a-zA-Z]{1,14}$') not valid` |
| `static_id` | integer, null | `unique`, `check (static_id between 1 and 999999999)`; null лише в старих персонажів без перенесення |

- Тригер `before insert`: не більше 3 персонажів на `owner`.
- RLS без змін: «свої персонажі» (`owner = auth.uid()`) — статік бачить лише власник.

## price_reports (зміни)

| Поле | Тип | Правила |
|---|---|---|
| `character_id` | uuid, null | `references characters on delete set null`; при вставці — персонаж автора зі статіком (див. нижче) |

`check_buyer_report()` при вставці від гравця (`reporter` не null):

```text
нік автора порожній                         → «Спершу вибери нік акаунта»
character_id задано, але не свій / без статіку → «Цей персонаж не твій» / «Вкажи статік персонажа»
character_id не задано, персонаж рівно один   → підставити його
character_id не задано, персонажів 0          → «Спершу додай персонажа»
character_id не задано, персонажів 2–3        → «Обери персонажа, з якого вписуєш ціну»
далі — межі скупника, ліміт за годину, виправлення за 10 хв (як у 0036)
```

Ті самі перевірки автора — у `set_next_change` і `report_unknown_item`.

## Публічні зведення (перестворюються)

| View | Було | Стане |
|---|---|---|
| `price_updates` | `reporter_name`, `reporter_game`, `reporter_static` | `reporter_id`, `reporter_name` (нік, запасне — ім'я Discord), `reporter_character` (Ім'я_Прізвище) |
| `contributors` | `name` (Discord), `game_name`, `static_id` | `name` = нік; без `game_name`, `static_id`; рахунок на акаунт |
| `buyer_next_change` | `game_name`, `static_id` профілю | `nick`, без статіку |
| `map_owners` | `static_id`, `game_name` з profiles | ті самі стовпці з `characters` (`static_id`, `name`) |

## Перенесення (у тій самій міграції, ідемпотентно)

1. `characters.static_id` ← `profiles.static_id`: персонажу з `name = profiles.game_name`, інакше найстаршому; лише
   де `static_id is null` і статік ще не зайнятий.
2. `price_reports.character_id` ← персонаж акаунта зі статіком, інакше найстарший; лише де `character_id is null`.
3. `profiles.nick` — не заповнюється.

## Стан акаунта

```text
вхід через Discord → [без ніка] → вибрав нік → [без персонажа] → додав персонажа (Ім'я_Прізвище + статік) → [готовий: дашборд, ціни]
```
