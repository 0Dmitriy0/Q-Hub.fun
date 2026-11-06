# Data Model: 043 «Довідник від гравців»

Міграція `0057_community_wiki.sql` (перший вільний номер після 0056 — перевірити перед злиттям, пам'ять prod-migrations-gaps).
Розділи (`section`): `job`, `vehicle`; пізніше `item` (045), `map_point`.

## Розділи-цілі

### `public.jobs` (нова)

| Поле | Тип | Правило |
|---|---|---|
| `id` | text PK | `^[a-z0-9-]{2,40}$` (як `Job.id`, назва файлу іконки) |
| `name` | text | 1–60, унікальна без урахування регістру |
| `legal` | boolean | |
| `level` | int | 0–100 |
| `profit` | smallint | 0–3 |
| `requirements`, `features`, `location`, `skills`, `progress`, `controls`, `tips` | text[] | кожен пункт 1–400 символів, ≤ 30 пунктів |
| `description`, `pay` | text | ≤ 3000 / ≤ 300 |
| `forum` | boolean | джерело — F.A.Q. форуму |
| `hidden` | boolean | «прибрано» (FR-015), default false |
| `version` | bigint | номер поточної версії, default 1 |
| `created_by`, `updated_by` | uuid → profiles, null | автор сторінки / останнім оновив |
| `created_at`, `updated_at` | timestamptz | |

RLS: читають усі, крім `hidden` (їх бачать `admin`/`moderator`); запис — лише `is_admin()`. Публікація — через `wiki_decide`.
Початкові дані — з `src/data/jobs.ts` (`version = 1`, `created_by = null` → «з F.A.Q. форуму / Q-Hub»).

### `public.vehicles` (наявна) — доповнення

- `+ hidden boolean default false`, `+ version bigint default 1`, `+ created_by uuid`, `+ updated_by uuid`, `+ updated_at timestamptz`.
- RLS запису: `is_staff()` → `is_admin()` (принцип II; `editor` надалі — через пропозиції).
- Поля, які можна пропонувати: `name, real_name, brand, salon, kind, fuel, currency, exclusive, vinyl, price, salon_price, min_level, speed, trunk, tank, seats, ua_plate`. **Не можна**: `image_url`, `model` (картинки — лише admin, принцип II), `extra`.

## Пропозиції й історія

### `public.wiki_proposals`

| Поле | Тип | Правило |
|---|---|---|
| `id` | uuid PK | |
| `section` | text | `job`, `vehicle` |
| `target_id` | text, null | id цілі (`jobs.id` чи `vehicles.id::text`); null — нова сторінка |
| `kind` | text | `new` / `edit` / `hide` |
| `data` | jsonb | лише поля розділу; для `hide` — `{}` |
| `base_version` | bigint, null | версія цілі, з якої почали правку |
| `source` | text | `game` / `discord` / `forum` / `own` |
| `source_note` | text | ≤ 300 (посилання чи пояснення) |
| `proof_path` | text | шлях у bucket `wiki-proof`, '' — немає |
| `author` | uuid → profiles | default `auth.uid()` |
| `status` | text | `pending` → `accepted` / `accepted_edited` / `rejected` / `conflict` / `withdrawn` |
| `reason` | text | обов'язкова для `rejected` (≤ 300) |
| `decided_by` | uuid, null | |
| `decided_at`, `seen_at` | timestamptz, null | |
| `version_id` | bigint, null → wiki_versions | що опубліковано |
| `created_at` | timestamptz | |

Правила: `kind = 'new'` ⇔ `target_id is null`; `status = 'rejected'` ⇒ `reason <> ''`; `status <> 'pending'` ⇒ `decided_at is not null` (крім `conflict`, `withdrawn`).
Тригер `before insert`: заборона (`wiki_bans`) і ліміт `pending` на автора (`wiki_settings.max_pending`) — людським текстом.
RLS: `select` — автор свої, `admin`/`moderator` усі; `insert` — будь-який автор з входом, лише `status = 'pending'`; `update` автора — лише `pending → withdrawn` і `seen_at`; рішення — лише `wiki_decide`.

Переходи стану:

```
pending ──wiki_decide accept──▶ accepted / accepted_edited
pending ──wiki_decide reject──▶ rejected (reason)
pending ──інша пропозиція до цілі прийнята──▶ conflict ──wiki_decide accept force──▶ accepted…
pending ──автор──▶ withdrawn
```

### `public.wiki_versions` (лише додається)

| Поле | Тип |
|---|---|
| `id` | bigint identity PK |
| `section`, `target_id` | text |
| `version_no` | bigint (унікальний з `section, target_id`) |
| `data` | jsonb — повний знімок полів після публікації |
| `kind` | `seed` / `accept` / `revert` / `hide` / `unhide` / `admin` |
| `proposal_id` | uuid, null |
| `author` | uuid, null — хто запропонував |
| `decided_by` | uuid, null — хто опублікував |
| `note` | text |
| `created_at` | timestamptz |

RLS: читають усі (FR-012, US3 AC4: історію бачать усі, діяти — лише модератор); запис — лише функції. Для `jobs` при міграції — запис `seed` версії 1.

### Допоміжні

- `wiki_settings` (один рядок, `id = true`): `max_pending int = 10`, `stale_days int = 30`, `proof_days int = 30`. Читають усі, змінює admin.
- `wiki_bans`: `user_id` PK → profiles, `reason`, `by`, `at`. Пише `admin`/`moderator`; читає автор свій рядок (щоб бачити пояснення) і модератори.
- view `wiki_contributors`: `id, name, avatar_url, accepted_edits, accepted_pages, rejected, last_at` за прийнятими/відхиленими пропозиціями.

## P3 (US6) — у цій міграції лише місце, реалізація пізніше

- `wiki_checks(section, target_id, version_no, user_id, at)` PK `(section, target_id, version_no, user_id)` — «Актуально».
- `wiki_notes(id, section, target_id, author, text ≤ 500, hidden, created_at)`.

## Сховище

Bucket `wiki-proof` (приватний): шлях `<uid>/<proposal_id>.webp`. Читає автор і `admin`/`moderator`, пише лише власник теки, видаляють автор і модератори.
