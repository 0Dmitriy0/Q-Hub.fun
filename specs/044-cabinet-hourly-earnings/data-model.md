# Data Model: Заробіток персонажа за годину

## game_sessions (наявна, + колонки)

Наявні: `id uuid`, `character_id uuid → characters (cascade)`, `started_at`, `ended_at`, `external_id text`, `unique (character_id, external_id)`. Політика «сесії персонажа»: `for all using/with check owns_character(character_id)` — лише власник.

Нові (усі nullable — старі рядки й старі версії програми їх не мають):

| Колонка | Тип | Правило |
|---|---|---|
| `money_from` | timestamptz | перше стабільне зчитування балансу в сеансі |
| `money_to` | timestamptz | останнє; `check (money_to >= money_from)` |
| `money_start` | bigint | баланс (готівка + картка) на `money_from`; `>= 0` |
| `money_end` | bigint | баланс на `money_to`; `>= 0` |
| `money_gain` | bigint | сума зростань («Заробив»); `>= 0` |
| `money_flag` | boolean, default false | був стрибок понад `money_rules.max_jump` |

Обмеження: усі шість полів або разом `null`, або разом заповнені (`money_flag` — завжди не null).

Похідні (не зберігаються):
- **Чистими** = `money_end − money_start` (може бути < 0).
- **Час** = `money_to − money_from`.
- **День** = дата `started_at` у `Europe/Kyiv`.

## money_rules (нова, один рядок)

| Колонка | Тип | Default | Check |
|---|---|---|---|
| `id` | boolean PK | true | `check (id)` |
| `max_jump` | bigint | 5 000 000 | 100 000 … 1 000 000 000 |
| `min_minutes` | int | 5 | 1 … 120 |

Права: `select` — усім (`anon` і `authenticated`, як `price_rules`); `update` — лише `is_admin()`.

## Локальний стан програми (settings.json)

- `settings.session` — `{ id, character, started, last }` (`id` тепер генерує програма; + `character` — персонаж сесії).
- `settings.sessionMoney` — `{ key, start, startAt, last, lastAt, gain, flag }` (+ `lastAt`, `gain`, `flag`).
- `settings.sessionQueue` — масив підсумків `{ id, character_id, started_at, ended_at, money_* }`, ще не записаних у базу; відправляється upsert-ом, після успіху видаляється. Ліміт — 200 записів (найстаріші відкидаються).

## Денний підсумок (сайт, обчислюється)

`{ day: 'РРРР-ММ-ДД', ms, gain, net, perHourGain, perHourNet, skipped }`, де `ms`, `gain`, `net` — суми по сеансах дня, що проходять фільтр (не `money_flag`, тривалість ≥ `min_minutes`); `skipped` — кількість відфільтрованих. Підсумок проміжку — та сама структура над усіма днями; `perHour* = null`, якщо `ms = 0`.

## Переходи стану сеансу

```text
гра запущена ──► рядок створено (upsert за id) ──► щохвилини: ended_at + money_* (upsert)
     │                                   │ немає зв'язку → лишається в settings.session
     ▼                                   ▼
гру закрито ──► фінальний upsert ──ok──► settings.session = null
                     │ помилка
                     ▼
              settings.sessionQueue ──(зв'язок є)──► upsert ──► видалено з черги
сеанс < MIN_SESSION (1 хв) ──► delete (як зараз)
```
