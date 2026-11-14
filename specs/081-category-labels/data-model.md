# Data Model: Назви міток — галочка на категорію

## map_categories (зміна)

| Поле | Тип | Правило |
|---|---|---|
| `show_labels` | `boolean not null default false` | **нове**; «показувати назви міток під значками»; наявні й нові — `false`; змінює лише admin (політика `map_categories: admin write`) |

## map_points (без змін)

- `show_label boolean not null default true` — власний підпис мітки; діє лише коли в категорії `show_labels = true`.

## Вбудовані категорії (код, `src/lib/mapMarks.ts` → `BUILTIN`)

- `jobs`, `buyers`: `show_labels: false` (рішення A); змінюються правкою коду.

## Правило показу (сайт і програма)

`підпис під міткою` ⇔ назва не порожня **і** `mark.label !== false` **і** (`cat.show_labels`, якщо поле є; інакше — `true`, база без міграції).
