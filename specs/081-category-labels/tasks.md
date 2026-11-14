# Tasks: Назви міток — одна галочка на категорію

**Input**: Design documents from `specs/081-category-labels/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/map-labels.md, quickstart.md

**Tests**: так — конституція, принцип VI (SQL-тест на права; `vitest` для правила підпису); research R2, R5.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Тести сайту зелені до змін: `npx.cmd vitest run src/lib/mapData.test.ts` і `npx.cmd tsc --noEmit -p .`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 Створити `supabase/migrations/0067_category_labels.sql`: коментар українською (specs/081, рішення власника A — наявним і новим `false`), `alter table public.map_categories add column if not exists show_labels boolean not null default false;`. Політик не змінювати (наявна `map_categories: admin write` уже обмежує зміну адміном). Файл ідемпотентний, «можна запускати повторно»
- [X] T003 [P] Створити `supabase/tests/category_labels_test.sql` за зразком `supabase/tests/site_stats_test.sql` (`\set ON_ERROR_STOP on`, тестові `auth.users` з ролями `user`, `editor`, `moderator`, `admin` у `public.profiles`): (а) колонка `show_labels` є, `default false`, у тестової категорії `false`; (б) від `anon` і кожної ролі `user`/`editor`/`moderator` — `update public.map_categories set show_labels = true where id = <тестова>` не змінює рядок (перевірити повторним читанням після `reset role`); (в) від `admin` — змінює. Тестову категорію створити й прибрати в тесті
- [X] T004 `src/lib/mapData.ts`: у `MapCategory` додати `show_labels?: boolean`; нова функція `labelShown(mark: Pick<MapMark, 'name' | 'label'>, cat?: Pick<MapCategory, 'show_labels'>)` = `!!mark.name?.trim() && mark.label !== false && (cat?.show_labels ?? true)` — поле відсутнє (база без 0067) чи категорії немає → `true`, як зараз (research R2). Коментар українською
- [X] T005 [P] Тести в `src/lib/mapData.test.ts` для `labelShown`: категорія `show_labels: false` → `false`; `true` + назва → `true`; `true` + `label: false` → `false`; `true` + порожня/пробільна назва → `false`; категорія без поля → `true`; без категорії → `true`

**Checkpoint**: `vitest` зелений; міграція й SQL-тест написані.

---

## Phase 3: User Story 1 — Адмін вмикає чи вимикає назви для всієї категорії (Priority: P1) 🎯 MVP

**Goal**: одна галочка в «Змінити категорію» керує підписами всієї категорії на мапі (сайт і програма).

**Independent Test**: quickstart.md п. 1–3, 5, 6.

- [X] T006 [US1] `src/pages/MapPage.tsx` (~рядок 275): замінити умову `if (mk.name && mk.label !== false)` на `if (labelShown(mk, catById[mk.category]))` (імпорт з `../lib/mapData`; `catById` — наявна мапа категорій у компоненті, перевірити назву й що вона доступна в цьому ефекті, і додати залежність ефекту від категорій, щоб після «Зберегти» в адмінці підписи перемалювалися). Тултіп, `LABEL_ZOOM`, картка й пошук — без змін (FR-006)
- [X] T007 [US1] `src/lib/mapMarks.ts`, `BUILTIN`: для `jobs` і `buyers` додати `show_labels: false` (рішення A; research R3) з коментарем «увімкнути назви робіт/скупників — тут»
- [X] T008 [US1] `src/components/MapAdmin.tsx`, форма «Змінити категорію» (`form(c)` ~рядок 76, `save()` ~83): додати `show_labels: !!c.show_labels` у форму, `show_labels: f!.show_labels` у `v` для `update`; чекбокс `<label className="mcheck"><input type="checkbox" checked={f.show_labels} onChange={…} /> Показувати назви міток на мапі</label>` з підказкою `muted`: «Під значками на наближеній мапі. Назва однаково видна по кліку й у пошуку.» (перевірити наявний клас чекбоксів у адмінці мапи й узяти його). Помилка з `show_labels` у тексті → «Галочки назв ще немає: запусти supabase/migrations/0067_category_labels.sql у Supabase → SQL Editor.» — дописати в той самий `setMsg(...)`, що вже розбирає помилки міграцій

**Checkpoint**: галочка вмикає/вимикає назви категорії; без міграції — підказка, мапа як раніше.

---

## Phase 4: User Story 2 — Нова категорія — без назв за замовчуванням (Priority: P2)

**Goal**: «Нова категорія» має ту саму галочку, знятою.

**Independent Test**: quickstart.md п. 4.

- [X] T009 [US2] `src/components/MapAdmin.tsx`, `addCat()` (~рядок 191) і форма створення: стан `cLabels` (`false` за замовчуванням), чекбокс «Показувати назви міток на мапі» поруч з полями нової категорії; у `row` — `show_labels: cLabels` лише якщо `true` (щоб без міграції створення не падало; `false` дає default бази); після створення — скинути `cLabels` у `false`

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T010 Журнали: `src/data/changelog.json` — у верхній запис пака (`"pending": true`) рядок у `"changed"`: «Мапа (Alt+M): назви під мітками — лише в категоріях, де їх увімкнув адмін; менше каші при наближенні». `src/data/sitenews.json` — новий запис з id `2026-11-14` (або `.2`, якщо такий уже в `main`), title «Мапа без каші з назв», `changed`: «Мапа: назви під мітками показуються лише в категоріях, де вони потрібні; назва однаково видна по кліку на мітку й у пошуку»
- [X] T011 `npx.cmd vitest run`, `npx.cmd tsc --noEmit -p .`, `npm.cmd run build` — зелені
- [X] T012 Власнику: SQL з `supabase/migrations/0067_category_labels.sql` — у буфер обміну (Windows Forms Clipboard, пам'ять `discord-bot-ops`) для Supabase → SQL Editor **до злиття**; SQL-тест `supabase/tests/category_labels_test.sql` — так само, за бажанням (він створює й прибирає тестові дані)
- [ ] T013 Власнику: одразу після міграції — галочки в потрібних категоріях (quickstart «Перед злиттям», п. 2); далі перевірка в браузері quickstart п. 1–6

---

## Dependencies & Execution Order

- T001 → T002 → (T003 ∥ T004) → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013
- T003 (SQL-тест) і T004 (mapData.ts) — різні файли, паралельно; T008 і T009 — один файл, по черзі.

## Parallel Example

```text
Після T002:  T003 (supabase/tests/category_labels_test.sql)  ∥  T004 (src/lib/mapData.ts)
Після T004:  T005 (mapData.test.ts)  ∥  T007 (mapMarks.ts)
```

## Implementation Strategy

- **MVP**: T001–T008 — галочка в наявних категоріях керує назвами.
- US2 (T009) — галочка в новій категорії.
- Випуск: міграція власником → галочки в потрібних категоріях → злиття (сайт одразу; мапа в програмі — з паком).
