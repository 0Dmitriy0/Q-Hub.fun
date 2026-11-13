# Tasks: Після «Надіслати мітку» — одразу назад у гру

**Input**: Design documents from `specs/078-pin-send-refocus/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pin-decide.md, quickstart.md

**Tests**: так — конституція, принцип VI (чиста логіка → `node --test`); research R3.

**Organization**: обидві історії йдуть через один обробник `pin-decide` (send = true / false), тож спільна частина — у Foundational, а історії лише підключають і перевіряють її.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Переконатися, що наявні тести програми зелені до змін: `cd desktop && npm.cmd test` (зокрема `desktop/src/gamefocus.test.cjs`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: рішення «ховати й повертати фокус» як чиста функція + запам'ятовування гри клавішею мітки. Без цього жодна історія не працює.

- [X] T002 Додати в `desktop/src/gamefocus.cjs` чисту функцію `closeToGame({ hadFocus, hide, giveBack })`: завжди викликає `hide()`; `giveBack()` — лише якщо `hadFocus === true`; повертає `true`, якщо фокус віддали, інакше `false`; помилка в `giveBack` не кидається назовні (повертає `false`). Експортувати поруч з `gameFocus`, `hwndOf`. Коментар українською: навіщо (research R1, R3)
- [X] T003 [P] Тести в `desktop/src/gamefocus.test.cjs` для `closeToGame`: (а) `hadFocus: true` → `hide` і `giveBack` викликано, результат `true`; (б) `hadFocus: false` (гравець пішов у Discord, FR-006) → `hide` викликано, `giveBack` — ні, `false`; (в) `giveBack` повертає `false` (гру закрили) → `false`, без винятку; (г) `giveBack` кидає виняток → `false`, `hide` усе одно викликано
- [X] T004 У `desktop/src/main.cjs`, функція `registerPinKey` (обробник `globalShortcut.register(key, …)`, ~рядок 694): першим рядком обробника викликати `game.remember()` — до `pinLog` і `pinShot()`, як у клавіш плашки (~861) і мапи (`mapKeyPressed`, ~255) (research R2, contracts/pin-decide.md «Клавіша мітки»)

**Checkpoint**: тести T003 зелені; Alt+F9 запам'ятовує вікно гри.

---

## Phase 3: User Story 1 — Надіслав мітку — і далі граю (Priority: P1) 🎯 MVP

**Goal**: після «Надіслати мітку» / «Надіслати точку» / «Надіслати без точки» (кнопка чи Enter) форма закривається, керування — у грі; результат видно поверх гри без фокусу.

**Independent Test**: quickstart.md, п. 1, 2, 6, 8.

- [X] T005 [US1] У `desktop/src/main.cjs`, обробник `ipcMain.handle('pin-decide', …)` (~рядок 1221): замінити `bar.hide()` на `closeToGame({ hadFocus: bar.isFocused(), hide: () => bar.hide(), giveBack: () => game.giveBack() })` (імпорт з `./gamefocus.cjs` поруч з `gameFocus`). Зберегти наявний захист: `const a = pinAsk; pinAsk = null; …hide…; pinAsk = a;` — `hadFocus` обчислити ДО `hide`, а `pinDecide(...)` викликати ПІСЛЯ повернення фокусу й без очікування мережі (FR-001, FR-004; research R1, R4). `showPin` не змінювати (вона показує результат через `showInactive`, FR-003)
- [X] T006 [US1] Запис у журнал: у `src/data/changelog.json` верхній запис пака має `"pending": true` — додати в нього групу `"fixed"` (або дописати в наявну) рядок мовою гравця: «Після «Надіслати мітку» (Alt+F9) керування одразу повертається в гру — не треба клікати по вікну гри». Нового запису не створювати (CLAUDE.md, правило паків)

**Checkpoint**: US1 перевіряється в грі за quickstart п. 1–2.

---

## Phase 4: User Story 2 — Передумав — теж одразу назад у гру (Priority: P2)

**Goal**: «Не надсилати» й Esc закривають форму й повертають керування в гру.

**Independent Test**: quickstart.md, п. 3, 4, 5, 7.

- [X] T007 [US2] Перевірити (без змін, якщо так і є) у `src/desktop/Bar.tsx`, компонент `PinAsk`: Esc і «Не надсилати» викликають `send(false)` → `decide(false)` → `api.pinDecide(false)`, тобто йдуть тим самим обробником з T005; а при незаповнених полях (`ask.player`, немає категорії чи назви) `decide` НЕ викликається і форма лишається з фокусом (FR-005). Якщо якийсь шлях оминає `pinDecide` — направити його через `decide`
- [X] T008 [US2] Доповнити рядок журналу з T006 у `src/data/changelog.json`: «…після «Надіслати мітку» чи Esc у формі мітки…» — один рядок на обидві історії

**Checkpoint**: обидві історії працюють; quickstart п. 3–5, 7.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T009 Усі тести програми: `cd desktop && npm.cmd test` — зелені
- [X] T010 Димова перевірка `desktop/src/main.cjs` підробленим electron (пам'ять `main-smoke-fake-electron`; не `npm start`, якщо Q-Hub власника запущена) — файл завантажується без помилок
- [X] T011 Типи сайту/плашки: `npx.cmd tsc --noEmit -p .` у корені — без помилок (changelog.json читає `src/lib/changelog.ts`)
- [ ] T012 Власнику: перевірка в грі за `specs/078-pin-send-refocus/quickstart.md` (п. 1–4 по 10 разів, SC-001…SC-004); після «перевірено» — позначити тут і в `docs/PLAN.md`, якщо там є пункт

---

## Dependencies & Execution Order

- T001 → T002 → (T003 ∥ T004) → T005 → T006 → T007 → T008 → T009–T011 → T012
- US2 залежить від T005 (той самий обробник), але перевіряється окремо.
- T003 і T004 — різні файли, паралельно.

## Parallel Example

```text
Після T002:  T003 (desktop/src/gamefocus.test.cjs)  ∥  T004 (desktop/src/main.cjs, registerPinKey)
Polish:      T009 ∥ T011
```

## Implementation Strategy

- **MVP**: Phase 1–3 (T001–T006) — головна незручність зникає після надсилання.
- Далі US2 (T007–T008) — фактично перевірка, що Esc/«Не надсилати» йдуть тим самим шляхом.
- Реліз — у складі пака (`pending`), лише за словом власника «випускай».
