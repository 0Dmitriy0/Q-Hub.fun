# Tasks: Окреме вікно з правилом поруч із плашкою

**Input**: Design documents from `specs/084-rule-sticky/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R7), data-model.md, contracts/rule-window.md, quickstart.md

**Tests**: так — конституція, принцип VI: чисті функції `desktop/src/rulewin.cjs` → `node --test`; кнопка лише з `onOpen` → `vitest`.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Тести зелені до змін: `cd desktop && npm.cmd test`, `npx.cmd vitest run src/desktop`, `npx.cmd tsc --noEmit -p .`
- [ ] T002 [P] Нова сторінка Vite `rule.html` у корені (за зразком `map.html`: `<div id="root">`, `<script type="module" src="/src/desktop/ruleMain.tsx">`) і `vite.app.config.ts` — додати `rule: 'rule.html'` у `build.rollupOptions.input` поруч із `bar`/`map`; перевірити, що `npm.cmd run build:app` (у `desktop/`) кладе `rule.html` туди ж, куди `bar.html`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [ ] T003 Створити `desktop/src/rulewin.cjs` — чисті функції за data-model.md: `clean(hit)` (обрізати: `topic`/`h` ≤ 300, `n` ≤ 40, `s` ≤ 8000; `url` лише з `https://forum.quant5.com.ua/`, інакше `''`; `kind` ∉ `rules|law|order|info` → `'rules'`); `key(hit)` = `` `${topic}|${n}|${h}` ``; `addTab(state, hit, now)` (дубль → лише `active`; 5 вже є → прибрати з найменшим `at` і `note: 'Відкрито 5 — найстаріше закрито'`; додати, `active = id`); `activate(state, id)`; `closeTab(state, id)` (закрили активну → сусідня праворуч, інакше ліворуч; порожньо → `active: null`); `place({ work, bar, saved })` за research R4 (типово — праворуч від плашки, у межах робочої області; збережене з перетином < 120×60 → типове; ширина 280…½ робочої, висота 160…½); `fit(bounds, work)`. Стан не мутувати — повертати новий. Коментар українською (specs/084)
- [ ] T004 [P] Тести `desktop/src/rulewin.test.cjs` (`node --test`): `clean` — чужий url → `''`, довгий `s` обрізано до 8000, невідомий `kind` → `rules`; `addTab` — нова вкладка активна; дубль не додається, лише активується; шоста прибирає найстарішу за `at` і дає `note`; `closeTab` — активна → сусідня праворуч, крайня права → ліва, остання → `active: null`; `place` — без збереженого: праворуч від плашки, в межах `work`; збережене поза екраном → типове; розмір обмежено 280…½ і 160…½
- [ ] T005 `desktop/src/preload.cjs`: у `window.qhub` — `ruleOpen(hit)` → `invoke('rule-open', hit)`, `ruleState()` → `invoke('rule-state')`, `onRuleState(cb)` ← `'rule-state'`, `ruleTab(id)`, `ruleCloseTab(id)`, `ruleClose()` (contracts/rule-window.md); коментар — specs/084

**Checkpoint**: `node --test src/rulewin.test.cjs` зелений; `rule.html` збирається.

---

## Phase 3: User Story 1 — Відкрити правило окремо й лишити поверх гри (Priority: P1) 🎯 MVP

**Goal**: «Відкрити окремо» біля пункту → окреме вікно праворуч; плашку сховано — вікно лишається, гра керується.

**Independent Test**: quickstart п. 1–3.

- [ ] T006 [US1] `desktop/src/main.cjs`: `createRuleWin()` — `BrowserWindow` за research R1 (`frame: false`, `transparent: false`, `backgroundColor` як у плашки, `resizable/movable: true`, `alwaysOnTop` рівня `'screen-saver'` як плашка, `skipTaskbar: true`, `show: false`, той самий `preload`), сторінка `rule.html` тим самим способом, що `bar.html`/`map.html`; `guardPage` як для інших вікон (навігація заборонена, посилання лише на форум — у браузер); створюється при першому відкритті й далі лише ховається (як мапа). Змінна `rulew`, стан `ruleState = { tabs: [], active: null, locked: true, note: null }`
- [ ] T007 [US1] Там само: `ipcMain.handle('rule-open', (e, hit) => …)` лише `fromBar(e)` — `ruleState = addTab(ruleState, clean(hit), Date.now())`; створити/показати `rulew.showInactive()` + `moveTop()` (ніколи `focus()`, research R3); місце — `place({ work, bar: bar.getBounds(), saved: prefs().ruleWin })`; `locked = !bar.isVisible()`; розіслати стан (`rulew.webContents.send('rule-state', …)`); `ipcMain.handle('rule-state', e => fromRule(e) ? ruleState : null)`; `fromRule(e)` = `e.sender === rulew?.webContents`
- [ ] T008 [US1] Там само: `hideUnlessOurs()` — вважати `rulew` своїм вікном (`f !== bar && f !== mapw && f !== rulew`), щоб клік у вікно правила при відкритій Alt+Q не ховав плашку; `before-quit` — закрити `rulew`, вкладки не зберігати (FR-008, FR-009)
- [ ] T009 [US1] Створити `src/desktop/ruleMain.tsx` (монтування, як `mapMain.tsx`: тема, `bar.css`) і `src/desktop/RuleWin.tsx`: заголовок «Правило» (`-webkit-app-region: drag`), тіло активної вкладки як у `RuleCard` — тег виду (`KIND`), номер (`numLabel`), назва документа-посилання, текст і покарання (`splitPenalty`), без «Показати повністю» (прокрутка вікна); стан з `api.ruleState()` + `api.onRuleState`; кнопка «×» (закрити вікно) — `no-drag`
- [ ] T010 [US1] `src/desktop/barParts.tsx`: `RuleCard` — необов'язковий проп `onOpen?: (h: RuleHit) => void`; є — кнопка «Відкрити окремо» (іконка + `title`) у `brule-top` поруч із «Копіювати пункт»; `src/desktop/Bar.tsx` — передати `onOpen={api.ruleOpen ? h => api.ruleOpen!(h) : undefined}` там, де малюються `RuleCard` (research R7); у типі API плашки — `ruleOpen?(h: RuleHit): Promise<boolean>`
- [ ] T011 [P] [US1] Тест `src/desktop/barParts.test.ts` (vitest): `RuleCard` без `onOpen` — кнопки «Відкрити окремо» немає; з `onOpen` — є, клік викликає `onOpen` з тим самим пунктом (якщо в наявних тестах немає рендеру компонентів — перевірити через чисту функцію/експорт, без DOM-залежностей, яких немає в CI)

**Checkpoint**: пункт відкривається окремим вікном; після Alt+Q вікно видно; quickstart п. 1–3.

---

## Phase 4: User Story 2 — Рухати й міняти розмір з Alt+Q; зафіксоване без неї (Priority: P1)

**Goal**: розблоковане поки плашка видна; зафіксоване й «прозоре для миші» — коли сховано; місце й розмір пам'ятаються.

**Independent Test**: quickstart п. 4–6.

- [ ] T012 [US2] `desktop/src/main.cjs`: `lockRule()` / `unlockRule()` за research R2 — lock: `setIgnoreMouseEvents(true)`, `setFocusable(false)`, `setResizable(false)`, `setMovable(false)`, `locked: true`; unlock — навпаки, `locked: false`; обидва розсилають стан. Викликати `unlockRule()` при показі плашки (там, де `raiseBar`/`showBar`) і `lockRule()` при схові (`hideBarToGame`, `bar.on('hide')`) — лише якщо `rulew` видиме. Закріплена плашка (видима) — розблоковано (spec, Edge Cases)
- [ ] T013 [US2] Там само: збереження місця — `rulew.on('moved'|'resized')` → дебаунс 400 мс → `savePrefs({ ruleWin: rulew.getBounds() })` (поле `ruleWin` у `BAR_DEFAULTS` = `null`); межі розміру — `setMinimumSize(280, 160)` і `setMaximumSize(½ робочої області)` при створенні
- [ ] T014 [US2] `src/desktop/RuleWin.tsx` + `src/desktop/bar.css`: у стані `locked` — заголовок без `drag`, кнопки «×» і вкладки неактивні (не показувати «×», замість нього — тихий значок «зафіксовано» з підказкою «Відкрий Alt+Q, щоб рухати»); стилі `.rwin`, `.rwin-head`, `.rwin-body` (прокрутка), `.rwin-locked` на токенах теми плашки
- [ ] T015 [US2] `Esc` у розблокованому вікні правила → `bar.focus()` у головному процесі (через `ruleClose`? ні — окремо: обробник `before-input-event` для `rulew` або клавіша на сторінці → новий виклик не потрібен, якщо `globalShortcut` плашки вже ловить Esc; перевірити й лише тоді додати, contracts «Поведінка вікна»)

**Checkpoint**: з відкритою Alt+Q вікно рухається й тягнеться; закрита — кліки йдуть у гру; після перезапуску — те саме місце.

---

## Phase 5: User Story 3 — Кілька правил — вкладки (Priority: P2)

**Goal**: кожне «Відкрити окремо» — вкладка в тому ж вікні (до 5), без дублів; перемикання й закриття — з відкритою Alt+Q.

**Independent Test**: quickstart п. 7–9.

- [ ] T016 [US3] `desktop/src/main.cjs`: `ipcMain.handle('rule-tab', (e, id) => …)`, `'rule-close-tab'`, `'rule-close'` — лише `fromRule(e)` і не `locked`; `activate` / `closeTab` з `rulewin.cjs`; порожньо → `rulew.hide()`; розіслати стан
- [ ] T017 [US3] `src/desktop/RuleWin.tsx`: рядок вкладок у заголовку — підпис `numLabel` + скорочення документа (`abbrsOf(topic)[0]` або перші 18 символів, research R6), активна підсвічена, «×» на кожній (лише розблоковано); примітка `note` — під заголовком на 4 с

**Checkpoint**: 3 пункти — одне вікно з 3 вкладками; дубль не додається; шоста замінює найстарішу з приміткою.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 Журнал: у `src/data/changelog.json` верхній запис пака (`"pending": true`), `"added"`: «Правило окремим вікном: біля пункту в Alt+Q — «Відкрити окремо»; вікно лишається поверх гри, коли ховаєш плашку. Поки Alt+Q відкрита — рухай і міняй розмір, закрита — вікно зафіксоване. Кілька правил — вкладки»
- [ ] T019 `cd desktop && npm.cmd test`, `npx.cmd vitest run`, `npx.cmd tsc --noEmit -p .`, `npm.cmd run build:app` — зелені; димова перевірка `main.cjs` підробленим electron (пам'ять `main-smoke-fake-electron`): обробники `rule-open`, `rule-state`, `rule-tab`, `rule-close-tab`, `rule-close` зареєстровані, `rule-open` з пунктом не падає
- [ ] T020 Перевірка бандла (пам'ять `stale-js-copies-shadow-ts`): у зібраному `rule.html` справді `RuleWin` з `.tsx`, а не стара копія
- [ ] T021 Головна сторінка Lavish (`.lavish/hub.html`): розділ 084 — «готово», макет вікна; «Зараз» — злиття й перевірка в грі
- [ ] T022 Власнику: перевірка в грі за `specs/084-rule-sticky/quickstart.md`

---

## Dependencies & Execution Order

- T001 → (T002 ∥ T003) → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018–T021 → T022
- `main.cjs` (T006–T008, T012–T013, T015–T016) — один файл, по черзі; `RuleWin.tsx` (T009, T014, T017) — по черзі.
- T002 і T003 — різні файли, паралельно; T004 і T011 — тести різних модулів.

## Parallel Example

```text
Після T001:  T002 (rule.html, vite.app.config.ts)  ∥  T003 (desktop/src/rulewin.cjs)
Після T003:  T004 (rulewin.test.cjs)  ∥  T005 (preload.cjs)
```

## Implementation Strategy

- **MVP**: T001–T014 — вікно відкривається, лишається поверх гри, налаштовується з Alt+Q і зафіксоване без неї (обидві P1-історії).
- US3 (T016–T017) — вкладки.
- Реліз — у паку (`pending`), за словом «випускай».
