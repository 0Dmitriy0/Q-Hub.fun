# Контракт: функції бази довідника (043)

Усі — `security definer`, `set search_path = ''`, `grant execute … to authenticated`. Помилки — `raise exception` з людським текстом українською (сайт показує його як є) і `errcode`, за яким сайт розрізняє випадки.

## Подати пропозицію — звичайний `insert`

`insert into wiki_proposals (section, target_id, kind, data, base_version, source, source_note, proof_path)` — RLS + тригер.

| Помилка (errcode) | Коли | Текст |
|---|---|---|
| `QH001` | автор у `wiki_bans` | «Тобі заборонено пропонувати правки: <причина>. Питання — у Discord Q-Hub.» |
| `QH002` | `pending` ≥ `max_pending` | «На розгляді вже 10 твоїх пропозицій — дочекайся рішення по них.» |
| `QH003` | `data` має поле поза білим списком розділу чи невірне значення | «Поле «<назва>» не можна змінити так: <чому>.» |

Перевірка полів (`QH003`) — та сама функція `wiki_clean(section, data)`, що й у `wiki_decide`: обрізає до білого списку, перевіряє типи й межі з data-model.

## `wiki_decide(p_id uuid, p_action text, p_data jsonb default null, p_reason text default '', p_force boolean default false) returns jsonb`

- Хто: `my_role() in ('admin','moderator')`, інакше `QH010` «Приймати правки можуть лише модератори.»
- `p_action`:
  - `accept` — публікує `p_data` (якщо задано й відрізняється від пропозиції — статус `accepted_edited`) або `data` пропозиції.
  - `reject` — потрібна `p_reason` (`QH011` «Вкажи причину відхилення.»).
- Пропозиція не `pending`/`conflict` → `QH012` «Цю пропозицію вже розглянуто.»
- `base_version` ≠ поточна версія цілі і не `p_force` → `QH013` «Картку змінили після цієї пропозиції — переглянь зміни поверх нової версії.» (сайт показує «було → стало» від поточної й кнопку «Прийняти поверх нової версії» → `p_force = true`).
- `kind = 'new'`: створює рядок цілі (`job` — `id` з `data.id` або з назви транслітом на клієнті; `vehicle` — identity), `created_by = author`.
- `kind = 'hide'`: `hidden = true`.
- Після публікації: `version + 1`, `updated_by = author`, `updated_at = now()`; запис `wiki_versions`; інші `pending` до тієї ж цілі → `conflict`.
- Повертає `{ status, version_no, target_id }`.

## `wiki_revert(p_section text, p_target text, p_version bigint, p_reason text) returns jsonb`

- Хто: `admin`/`moderator` (`QH010`).
- Публікує `data` вказаної версії як нову версію `kind = 'revert'`, `note = p_reason`; `hidden` — як у тій версії. Інші `pending` → `conflict`.
- Неіснуюча версія → `QH014` «Такої версії немає.»

## `wiki_unhide(p_section text, p_target text, p_reason text)` — повернути прибрану сторінку (FR-015), ті самі права; версія `unhide`.

## `wiki_seen() returns void` — позначити рішення по своїх пропозиціях побаченими (`seen_at = now()` де `decided_at is not null and seen_at is null and author = auth.uid()`).

## Білий список полів (`wiki_clean`)

- `job`: `name, legal, level, profit, requirements, features, location, skills, progress, controls, tips, description, pay` (+ `id` лише для `new`). `forum` не пропонується.
- `vehicle`: `name, real_name, brand, salon, kind, fuel, currency, exclusive, vinyl, price, salon_price, min_level, speed, trunk, tank, seats, ua_plate`. Без `image_url`, `model`, `extra`.

## Сайт ↔ база: що читає сторінка

- Роботи: `jobs?hidden=eq.false` (staff — усі); картка показує `created_by`/`updated_by` (ім'я з `profiles`), `updated_at`, позначку «Нове»/«Оновлено» ≤ 7 днів.
- Історія: `wiki_versions?section=eq.job&target_id=eq.<id>&order=version_no.desc`.
- Черга: `wiki_proposals?status=in.(pending,conflict)&order=created_at.asc` + лічильник і вік найстарішої.
