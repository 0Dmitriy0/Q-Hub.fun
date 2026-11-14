# Tasks: Alt+Q щоразу відкривається чистою

**Input**: Design documents from `specs/082-bar-fresh-open/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bar-open.md, quickstart.md

**Tests**: так — конституція, принцип VI (`vitest` для `freshAsks`); research R2.

**Organization**: у специфікації одна історія (US1).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Тести зелені до змін: `npx.cmd vitest run src/desktop` і `npx.cmd tsc --noEmit -p .`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 Створити `src/desktop/barReset.ts`: `export function freshAsks<T extends { unseen?: boolean }>(asks: T[]): T[]` — повертає лише записи з `unseen === true`, кожен без поля `unseen` (новий об'єкт, вхід не мутувати), порядок той самий. Коментар українською (specs/082: при новому Alt+Q на плашці лишається тільки відповідь ШІ, що прийшла, поки плашку не бачили; решта — в «Історії»)
- [X] T003 [P] Тести `src/desktop/barReset.test.ts` (vitest): порожній список → `[]`; усі побачені → `[]`; одна `unseen` серед трьох → лише вона, без `unseen`; порядок кількох `unseen` зберігається; вхідний масив і об'єкти не змінено

**Checkpoint**: `npx.cmd vitest run src/desktop/barReset.test.ts` зелений.

---

## Phase 3: User Story 1 — Кожне відкриття Alt+Q — як перше (Priority: P1) 🎯 MVP

**Goal**: при новому відкритті плашка згорнута, без старих відповідей; «Історія» без змін; відповідь ШІ, що прийшла, поки плашку не бачили, — лишається.

**Independent Test**: quickstart.md п. 1–5.

- [X] T004 [US1] `src/desktop/Bar.tsx`: у тип `Ask` (знайти його оголошення) додати `unseen?: boolean`
- [X] T005 [US1] `src/desktop/Bar.tsx`, функція `ask()` (~рядок 170): запис відповіді — `{ q: text, reply: r.reply || '', error: r.error, unseen: !document.hasFocus() }` (research R2). `plain()` і `pickHist()` — без змін (миттєві, гравець бачить результат)
- [X] T006 [US1] `src/desktop/Bar.tsx`, обробник `api.onQuickShow(...)` (~рядок 125): додати `setAsks(freshAsks);` (імпорт з `./barReset`). Решта скидань і `mode` — без змін (FR-005)
- [X] T007 [US1] Перевірити, що `expanded` (~рядок 216) після T006 при відкритті в режимі правил/ШІ без `unseen` і без `busy` дає `false` (плашка згорнута), а з `busy` — лишається як зараз («ШІ думає…»)

**Checkpoint**: quickstart п. 1–5.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T008 Журнал: у `src/data/changelog.json` верхній запис пака (`"pending": true`) — у `"changed"` рядок: «Alt+Q щоразу відкривається чистою — без минулих відповідей; попередні пошуки й питання до ШІ — кнопкою «Історія»». Нового запису не створювати
- [X] T009 `npx.cmd vitest run`, `npx.cmd tsc --noEmit -p .`, `cd desktop && npm.cmd test` — зелені
- [ ] T010 Власнику: перевірка в програмі за `specs/082-bar-fresh-open/quickstart.md`

---

## Dependencies & Execution Order

- T001 → T002 → T003 ∥ T004 → T005 → T006 → T007 → T008 → T009 → T010
- T003 (тест) і T004 (`Bar.tsx`) — різні файли, паралельно; T004–T007 — один файл, по черзі.

## Parallel Example

```text
Після T002:  T003 (src/desktop/barReset.test.ts)  ∥  T004 (src/desktop/Bar.tsx)
```

## Implementation Strategy

- **MVP = уся функція**: T001–T007 (одна історія, ~10 рядків).
- Реліз — у паку (`pending`), за словом власника «випускай».
