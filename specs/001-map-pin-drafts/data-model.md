# Data Model: Чернетки міток з гри

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Координати — метри гри (X схід, Y північ), як у `map_points` (`0015_map.sql`).

## map_drafts (нова таблиця, міграція `0019_map_drafts.sql`)

| Поле | Тип | Правила |
|------|-----|---------|
| `id` | `uuid` PK | створює програма (`crypto.randomUUID()`); повтор `insert` з тим самим `id` — не дубль (принцип V) |
| `author` | `uuid` not null | default `auth.uid()`, FK `profiles(id) on delete cascade`; при `insert` MUST = `auth.uid()` |
| `taken_at` | `timestamptz` not null | коли натиснуто F9 (час на ПК); не в майбутньому більше ніж на 10 хв |
| `created_at` | `timestamptz` not null | default `now()` — коли дійшло на сервер |
| `shot` | `text` not null | шлях у бакеті: `<author>/<id>.jpg` |
| `x`, `y` | `double precision` null | обидва задані або обидва `null` («точку не визначено»); межі як у `map_points`: x −6000…6800, y −4400…8500 |
| `match` | `jsonb` not null default `'{}'` | службове: `{ scale_m_per_px, score, ratio, screen: [w,h], version }` — для підбору порогів (R5) |
| `status` | `text` not null | `new` → `published` \| `rejected`; при `insert` лише `new` |
| `reviewed_by` | `uuid` null | хто обробив (admin) |
| `reviewed_at` | `timestamptz` null | коли обробив |
| `point_id` | `bigint` null | FK `map_points(id) on delete set null`; заданий лише при `published` |
| `shot_deleted_at` | `timestamptz` null | коли знімок видалено (R10) |

Індекси: `(status, created_at desc)` — черга; `(author, created_at desc)` — «мої чернетки».

Check-обмеження:
- `(x is null) = (y is null)`
- `status in ('new','published','rejected')`
- `status = 'new' or (reviewed_by is not null and reviewed_at is not null)` — оброблена чернетка завжди має, хто й коли
- `point_id is null or status = 'published'` — мітка буває лише в опублікованої (після видалення мітки `point_id` стає `null`, статус лишається)

### Переходи станів

```text
new ──publish_map_draft(admin)──▶ published   (+ рядок у map_points, point_id)
new ──reject_map_draft(admin)───▶ rejected
published / rejected ── будь-яка дія ──▶ помилка already_processed («Чернетку вже оброблено»)
```

### Права (RLS)

| Хто | select | insert | update / delete |
|-----|--------|--------|-----------------|
| anon, `user` | — | — | — |
| `editor`, `moderator` | лише свої (`author = auth.uid()`) | свої, `status = 'new'`, без `reviewed_*` / `point_id` | — |
| `admin` | усі | як editor | лише через RPC (R9) |

`map_points` не змінюється: запис і далі лише admin; RPC публікації — `security definer` з перевіркою `is_admin()` (принцип II).

## Бакет `map-drafts` (Storage)

- приватний, ліміт 3 МБ, лише `image/jpeg`;
- `insert`: `is_staff()` і перша тека шляху = `auth.uid()`;
- `select`: `is_admin()` або перша тека = `auth.uid()` (автор бачить свій знімок — FR-018);
- `delete`: `is_admin()`.

## Локальні дані програми (не в базі)

- `%APPDATA%\Q-Hub\drafts\<id>.jpg` + `<id>.json` — черга до відправки: `{ id, taken_at, x, y, match }`. Видаляється після успішної відправки або відмови в правах (R7).
- `%APPDATA%\Q-Hub\map\export.bin`, `export.json`, `etag` — кеш еталона мапи (R6).
- `settings.bar.pinKey` — клавіша, за замовчуванням `F9` (R8).

## Наявні сутності

- **map_points** — публікація створює один рядок: `category_id`, `name`, `note`, `x`, `y`, `created_by = admin`.
- **map_categories** — лише вибір наявної; нові категорії — поза межами.
