# Data Model: 096

## buyers (зміна)

| Поле | Тип | Нове | Правила |
|---|---|---|---|
| `fixed_prices` | boolean not null default false | ✓ | змінює лише staff (RLS/`is_staff()`) |
| `sale_limit` | numeric null | ✓ | > 0 або null; змінює лише staff |
| `sale_limit_unit` | text null | ✓ | `'кг'` / `'шт'`; null, якщо `sale_limit` null |
| `next_change_at` | timestamptz | — | при `fixed_prices = true` має бути null. `set_next_change` відмовляє; увімкнення прапорця обнуляє час |

## items (нові рядки)

Категорія `fish`, одиниця `кг`, `image_url` = `/icons/fish/<file>.svg`.

| name | file | стартова ціна $/кг |
|---|---|---|
| Короп | carp | 197 |
| Щука | pike | 307 |
| Сом | catfish | 482 |
| Лосось | salmon | 520 |
| Мурена | moray | 558 |
| Осетр | sturgeon | 825 |

Якщо `name` уже існує (R7), береться наявний рядок.

## buyer_items (скупник `fish`)

20 рядків, `price` = таблиця з spec.md «Контекст», `price_at` = 2026-11-24 00:25 (час знімків). Межі `min_price`/`max_price` фіксований скупник не використовує: у 0082 лишаються як є, інтерфейс їх не показує.

Зміна `price` пише точку в `price_history` наявним тригером, тож старі змінні ціни в історії лишаються (FR-011).

## price_reports (поведінка)

`check_buyer_report`: якщо `buyers.fixed_prices` скупника = true і внесення не ручне від staff → `raise exception 'У цього скупника фіксовані ціни — їх оновлює адміністрація.'`.

## buyer_limit_reports (поведінка)

`report_limit_mismatch` для фіксованого скупника приймає ціну ≠ поточна, без перевірки меж. Рядок означає «на екрані інша ціна, перевір фіксовану». Бачить і прибирає лише admin (як і досі).

## Переходи стану

```text
звичайний ──staff вмикає fixed_prices──▶ фіксований   (next_change_at := null; голоси гравців — відхиляються)
фіксований ──staff вимикає──▶ звичайний             (поточні ціни лишаються; голоси, таймер, межі — знову діють)
```
