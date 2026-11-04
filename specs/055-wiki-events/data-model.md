# Data Model: Івенти у WIKI (055)

Міграція `supabase/migrations/0051_season_events_wiki.sql`, ідемпотентна (`if not exists`, `drop policy if exists`).

## `public.season_events` (наявна, 0025 / 0034) — нові колонки

| Колонка | Тип | Правило | Навіщо |
|---|---|---|---|
| `slug` | text not null unique | `^[a-z0-9-]{2,60}$`; наявним рядкам — `event-<id>` | адреса `/wiki/iventy/<slug>` (FR-004) |
| `kind` | text not null default `'event'` | `in ('event','battlepass')` | банер і таблиця рівнів (FR-009) |
| `image_url` | text not null default `''` | `'' or ~ '^https://'` | фото плитки й сторінки (FR-002) |
| `body` | text not null default `''` | ≤ 20 000 | повний опис (FR-004), формат R3 |
| `prev_id` | bigint null | FK `season_events(id) on delete set null`, `<> id` | «Минулого разу» (FR-010) |

Наявні: `title` (1–80), `description` (≤ 600 — короткий опис плитки), `starts_on`, `ends_on` (null — «до оголошення»),
`link`, `created_at`.

Стан не зберігається: «Триває / Скоро / Завершився» рахує `phase(starts_on, ends_on, kyivDay(now))` (SC-004).

## `public.season_event_maps` (нова)

| Колонка | Тип | Правило |
|---|---|---|
| `event_id` | bigint not null | FK `season_events(id) on delete cascade` |
| `category_id` | text not null | FK `map_categories(id) on delete cascade on update cascade` |

Ключ `(event_id, category_id)`. Мітки беруться з `map_points` цих категорій тими самими правилами видимості, що на
великій мапі (неопубліковані партії гість не бачить).

## `public.season_event_levels` (нова)

| Колонка | Тип | Правило |
|---|---|---|
| `event_id` | bigint not null | FK `season_events(id) on delete cascade` |
| `level` | integer not null | 1–500 |
| `line` | text not null default `'free'` | `in ('free','paid')` |
| `reward` | text not null | 1–200 символів |

Ключ `(event_id, level, line)`. Має сенс лише для `kind = 'battlepass'` (інтерфейс не показує для інших; база не
забороняє, щоб зміна типу не губила рядки).

## Права (RLS)

| Таблиця | select | insert / update / delete |
|---|---|---|
| `season_events` | усі (як було) | `is_staff()` (як було) |
| `season_event_maps` | усі | `is_staff()` |
| `season_event_levels` | усі | `is_staff()` |
| `storage.objects`, бакет `catalog`, `name like 'events/%'` | публічний бакет | `is_staff()` (нові політики) |

## Тип на сайті (`src/lib/seasons.ts`)

```ts
interface SeasonEvent {
  id: number; slug: string; kind: 'event' | 'battlepass';
  title: string; description: string; body: string; image_url: string;
  starts_on: string; ends_on: string | null; link: string; prev_id: number | null;
}
```

Блок на головній читає ті самі рядки (додатково `slug`, щоб плитка вела на сторінку).
