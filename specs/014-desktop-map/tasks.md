---

description: "Задачі: мапа Q-Hub у програмі поверх гри"
---

# Tasks: Мапа Q-Hub у програмі поверх гри

**Input**: Design documents from `/specs/014-desktop-map/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-map.md, contracts/qmap-protocol.md, quickstart.md

**Tests**: модульні тести для чистої логіки — обов'язкові за конституцією (принцип VI): сайт і вікна програми — `vitest`,
головний процес — `node --test`. Нових правил бази немає — SQL-тестів не треба.

**Organization**: задачі згруповано за історіями зі spec.md (US1–US4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можна паралельно (інші файли, без залежностей від незавершених задач)
- **[Story]**: US1–US4 зі spec.md

---

## Phase 1: Setup

**Purpose**: нова точка входу вікна мапи в збірці інтерфейсу програми

- [X] T001 Створити `map.html` у корені (як `history.html`: `<div id="root">`, `<script type="module" src="/src/desktop/mapMain.tsx">`, `data-theme="dark"` на `<html>`, заголовок «Q-Hub · мапа»)
- [X] T002 Додати `map: 'map.html'` у `rollupOptions.input` в `vite.app.config.ts` і оновити коментар про вікна програми

---

## Phase 2: Foundational (блокує всі історії)

**Purpose**: файли мапи у вікні з `file://` (сайт не віддає CORS — research R2) і режим «лише перегляд» сторінки мапи

- [X] T003 [P] Тест `desktop/src/qmap.test.cjs`: шлях лише `[A-Za-z0-9_./-]` без `..` (інакше 400); той самий `v` у кеші — без мережі; інший `v` — завантаження й запис у кеш; помилка мережі зі старим файлом — старий; без файлу — 404; `Content-Type` за розширенням (`.webp` image/webp, `.json` application/json, `.bin` application/octet-stream) — за contracts/qmap-protocol.md
- [X] T004 Реалізувати `desktop/src/qmap.cjs`: `createQmap({ site, dir, fetch })` → `handle(request) → Response`, кеш у `dir` (`%APPDATA%\Q-Hub\map\site`), `index.json` кешу `{ "<шлях>": { v, lm } }`; лише `/map/…` з `cfg.site` (contracts/qmap-protocol.md)
- [X] T005 Підключити протокол у `desktop/src/main.cjs`: `protocol.registerSchemesAsPrivileged([{ scheme: 'qmap', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])` до `app.whenReady`, `protocol.handle('qmap', …)` після нього
- [X] T006 [P] Тест `src/lib/mapGeo.test.ts`: `mapUrl('/map/v/index.json')` на `http(s):` — як зараз (`/map/…?v=MAP_V`), на `file:` — `qmap://site/map/…?v=MAP_V`
- [X] T007 Змінити `mapUrl()` у `src/lib/mapGeo.ts`: база `qmap://site` для `location.protocol === 'file:'` (як `asset()` у `src/lib/app.ts`)
- [X] T008 Додати проп `embed?: boolean` у `src/pages/MapPage.tsx`: при `embed` не рендерити `MapAdmin`, `CatEdit`, `MarkEdit`, `GameMapExport`, `MapShot`, `MapDrafts`, `MapAreaDraw`, `MapAreaEdit`, кнопки «Змінити / Власник / Видалити» в картках (`isAdmin && !embed`), кадр не писати в `history.replaceState` (FR-014)
- [X] T009 [P] jsdom у проєкті немає — рішення «що показувати» винесено в чисту функцію `mapRights(role, isStaff, embed)` у `src/lib/mapFilters.ts` з тестом у `src/lib/mapFilters.test.ts`: при `embed` і ролі `admin` немає жодного інструмента правки

**Checkpoint**: сторінку мапи можна показати в будь-якому вікні з `file://` і лише для перегляду

---

## Phase 3: User Story 1 — Відкрити мапу, не виходячи з гри (P1) 🎯 MVP

**Goal**: мапа Q-Hub поверх гри окремою плашкою, клавіша Alt+M і кнопка «Мапа» в плашці, Esc закриває, фокус — назад у гру

**Independent Test**: у грі Alt+M → мапа поверх гри, увімкнути «Поля полювання», клікнути поле — назва й опис; Esc — гра не згорталась, фокус у грі (quickstart #1–4, #12)

### Tests for User Story 1

- [X] T010 [P] [US1] Тест `desktop/src/mapwin.test.cjs`: `place({ work, bar, hist })` — під плашкою з відступом 12 px, праворуч від історії (якщо видима) або від `work.x + 12`, до правого й нижнього краю − 12 px; без плашки — ≈80 % робочої області по центру; 1366×768 — ширина й висота не менші за 640×420 (FR-001, edge case)

### Implementation for User Story 1

- [X] T011 [US1] Реалізувати `desktop/src/mapwin.cjs` → `place()` (чиста функція, тести T010)
- [X] T012 [US1] Вікно мапи в `desktop/src/main.cjs`: `createMap()` як `createHist()` (`frame: false`, `transparent`, `skipTaskbar`, `alwaysOnTop('screen-saver')`, `resizable: false`, preload, sandbox, `will-navigate` заборонено), `loadFile('ui/map.html')`; створюється при першому показі, далі лише `hide()` (FR-016, SC-002)
- [X] T013 [US1] Показ/приховування в `desktop/src/main.cjs`: `toggleMap(from: 'bar'|'key')` — межі з `mapwin.place`, `map-shown` у вікно; з клавіші — `show()` + `focus()` з тим самим захистом від RAGE MP, що `barSteals`; з плашки — `showInactive()`; `blur` у гру ховає, якщо плашку не закріплено; `hideUnlessOurs()` і `bar.on('hide')` знають про вікно мапи (FR-001, FR-001a, FR-004)
- [X] T014 [US1] Клавіша мапи в `desktop/src/main.cjs`: `BAR_DEFAULTS.mapKey = 'Alt+M'`, `registerMapKey()` як `registerHotkey`, не вдалось — повідомлення в треї; `barPrefs({ mapKey })` перевіряє конфлікт з `hotkey`, `pinKey`, `SHOT_KEY` і повертає `error: 'Клавіша вже зайнята: …'` (FR-002)
- [X] T015 [US1] IPC за contracts/ipc-map.md у `desktop/src/main.cjs` і `desktop/src/preload.cjs`: `mapHide`, `mapKey`, `mapToggle`; `fromMap(e)`; події `map-shown`; відповідні типи в `src/desktop/Bar.tsx` (інтерфейс `api`)
- [X] T016 [P] [US1] Вікно `src/desktop/mapMain.tsx`: `MemoryRouter` + `AuthProvider` + `<MapPage embed />`, шапка як у «Історії» (назва «Мапа», підказка клавіші, хрестик → `mapHide`), Esc → `mapHide`; посилання `data-nav` на сторінки сайту — `qhub.site(path)` (відкрити в браузері); стилі — `src/desktop/bar.css` (клас `.mapwin`)
- [X] T017 [US1] Кнопка «Мапа» в рядку плашки поряд з кнопкою історії в `src/desktop/Bar.tsx` (`aria-pressed`, підказка з клавішею) → `mapToggle()`
- [X] T018 [US1] Клавіша мапи в Налаштуваннях → Клавіші в `src/desktop/Settings.tsx`: `KeyRec` + «скинути» до Alt+M, рядок «Мапа» в списку клавіш, показ `error` з `barPrefs`; `Prefs.mapKey` у `src/desktop/Bar.tsx`

**Checkpoint**: MVP — мапа відкривається поверх гри й закривається, ті самі мітки, що на сайті

---

## Phase 4: User Story 2 — Знайти й відфільтрувати (P1)

**Goal**: пошук і фільтри як на сайті, вибір запам'ятовується, місця з рядка Alt+Q відкривають мапу

**Independent Test**: «24/7» — лише магазини 24/7; вимкнути всі групи, крім полів; закрити й відкрити — те саме; у рядку Alt+Q «заправка» → клік → мапа з нею в центрі (quickstart #5–6)

### Tests for User Story 2

- [ ] T019 [P] [US2] Тест `src/desktop/barSearch.test.ts`: `places(q, marks, cats, limit)` — збіг за назвою мітки й назвою категорії, та сама нормалізація, що `barSearch` («24/7», «заправка», «заправки»); порожній запит — нічого; не більше `limit`
- [ ] T020 [P] [US2] Тест кадру в `src/lib/mapGeo.test.ts`: `readView/saveView` (`qhub:map:view` = `{ x, y, z }`) — биті дані й порожньо → `null`

### Implementation for User Story 2

- [ ] T021 [US2] Кадр при `embed` у `src/pages/MapPage.tsx`: замість адреси `#x,y,z` — `qhub:map:view` у `localStorage` (зчитати при створенні мапи, писати на `moveend`); фільтри — ті самі ключі `qhub:map:on`, `qhub:map:open` (FR-006)
- [ ] T022 [US2] Реалізувати `places()` у `src/desktop/barSearch.ts` (тести T019)
- [ ] T023 [US2] Результати-місця в рядку плашки в `src/desktop/Bar.tsx`: мітки — `loadMapData()` з кешем 10 хв; блок «Місця» (іконка категорії, назва, категорія); клік → `qhub.mapOpen({ id, x, y })` (FR-007)
- [ ] T024 [US2] `mapOpen` у `desktop/src/main.cjs` і `desktop/src/preload.cjs`: показати мапу (`from: 'bar'`) і надіслати `map-focus`; у `src/pages/MapPage.tsx` при `embed` — подія `map-focus` центрує мапу на точці (зум 6) і відкриває картку мітки з цим `id`
- [ ] T025 [US2] Перевірити згортання панелі фільтрів на 1366×768 у вікні мапи (`src/desktop/bar.css`, `.mapwin`) — edge case

**Checkpoint**: US1 + US2 — повноцінна довідка без «Де я?»

---

## Phase 5: User Story 3 — «Де я?» на мапі (P2)

**Goal**: позначка «Ти тут» з великої карти гри і найближчі мітки з відстанню

**Independent Test**: біля відомого місця відкрити велику карту гри, Alt+M — «Ти тут» ≤ 100 м; без великої карти — підказка без позначки; знімки ніде не зберігаються (quickstart #7–9, «приватність»)

### Tests for User Story 3

- [ ] T026 [P] [US3] Тест `src/lib/mapNear.test.ts`: `nearest(marks, from, catIds, n = 5)` — евклідова відстань у метрах гри, округлення до 10 м, сортування, лише вибрані категорії, `n` найближчих, порожньо без міток

### Implementation for User Story 3

- [ ] T027 [P] [US3] Реалізувати `src/lib/mapNear.ts` → `nearest()` (тести T026)
- [ ] T028 [US3] Локатор для всіх у `desktop/src/main.cjs`: `startLocator()` за першої потреби «Де я?» для будь-якої ролі (не лише `STAFF`); F9 лишається лише для редакторів (FR-009)
- [ ] T029 [US3] «Де я?» клавішею в `desktop/src/main.cjs`: при натисканні клавіші мапи, поки мапа схована, — `grabScreen()` до показу; `mapmatch.scaleBar()` знайшла шкалу — показати мапу, `map-where { state: 'busy' }`, потім `locatePin()` → `map-where { ok, x, y }` або `{ ok: false, why: WHY[kind] }` (FR-008, FR-008a)
- [ ] T030 [US3] «Де я?» кнопкою: `mapWhere()` у `desktop/src/main.cjs` і `desktop/src/preload.cjs` — сховати мапу, плашку й історію → 120 мс → `grabScreen()` → показати як були → `locatePin()`; знімок не пишеться на диск (без `pin-last.png`) і не надсилається; у `pin.log` — лише `where` з координатами чи причиною (FR-008a, FR-010)
- [ ] T031 [US3] Компонент `src/desktop/MapWhere.tsx`: кнопка «Де я?», стан «Шукаю…», маркер «Ти тут» (окремий шар Leaflet), підказка при невдачі («Не вдалося визначити — відкрий велику карту гри й спробуй ще» + причина), список «Найближчі» з `nearest()` для увімкнених категорій із відстанню; клік у списку — центрувати мітку (FR-008, FR-009, FR-011)
- [ ] T032 [US3] Вбудувати `MapWhere` у `src/pages/MapPage.tsx` лише при `embed` (слот у HUD поряд з кнопками масштабу), передати мапу Leaflet і видимі мітки

**Checkpoint**: «Де я?» працює для всіх гравців, без запису знімків

---

## Phase 6: User Story 4 — Свіжа мапа й офлайн (P3)

**Goal**: зміни з сайту за ≤ 10 хв без оновлення програми; без інтернету — остання копія з датою

**Independent Test**: додати мітку на сайті — за ≤ 10 хв вона в програмі; вимкнути інтернет і перезапустити програму — мапа й мітки є, напис «станом на …» (quickstart #10–11)

### Tests for User Story 4

- [ ] T033 [P] [US4] Тест `src/desktop/mapCache.test.ts`: `saveCopy/readCopy` (`qhub:map:copy` = `{ at, cats, marks, areas, owners }`), биті дані → `null`; `stale(at, now)` — `true` з 5 хв; `asOf(at)` — «станом на 29.10, 14:05» (київський час)

### Implementation for User Story 4

- [ ] T034 [P] [US4] Реалізувати `src/desktop/mapCache.ts` (тести T033)
- [ ] T035 [US4] Дані при `embed` у `src/pages/MapPage.tsx`: при старті — копія з `mapCache` (одразу показати), потім `loadMapData()`; вдало — `saveCopy`; невдало й є копія — напис «Станом на … — немає зв'язку» в HUD; на подію `map-shown` — `loadMapData()`, якщо `stale()` (FR-012, FR-013)

**Checkpoint**: усі історії працюють незалежно

---

## Phase 7: Polish & Cross-Cutting

- [ ] T036 Версія `0.4.0` у `desktop/package.json` (велике оновлення, FR-017)
- [ ] T037 Запис `2026-10-29` у `src/data/changelog.json` з `"version": "0.4.0"`: «added» — мапа Q-Hub поверх гри (Alt+M, кнопка «Мапа»), пошук і фільтри, місця в рядку Alt+Q, «Де я?» з найближчими мітками, мапа без інтернету; коротко, мовою гравця. Той самий день — доповнити наявний запис і підняти в ньому `version`
- [ ] T038 [P] Опис клавіші й «Де я?» в `src/desktop/Settings.tsx` (список клавіш) і, якщо є, у підказках першого запуску плашки
- [ ] T039 `npm.cmd run build:app`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run`, `cd desktop; npm.cmd test` — усе зелене
- [ ] T040 Пройти quickstart.md у грі (сценарії 1–15), заміряти FPS з відкритою й закритою мапою (SC-005), записати результат у spec.md → «Реалізація»; статус spec.md — Implemented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → історії
- **US1** залежить лише від Phase 2. **US2**, **US3**, **US4** працюють у вікні з US1 (T012–T016), але кожна перевіряється окремо
- **Polish** — після потрібних історій

### Within Each User Story

- Тест чистої функції → функція → головний процес → вікно / плашка

### Parallel Opportunities

- T003 ‖ T006 ‖ T009 (різні файли)
- T010 ‖ T016 після Phase 2
- T019 ‖ T020; T026 ‖ T027 ‖ T033 ‖ T034 — чиста логіка без залежностей між собою

---

## Parallel Example: User Story 3

```text
Task: "Тест nearest() у src/lib/mapNear.test.ts"            (T026)
Task: "Реалізувати nearest() у src/lib/mapNear.ts"           (T027)
Task: "Тест копії мапи у src/desktop/mapCache.test.ts"       (T033, US4 — незалежна)
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1–2: збірка `map.html`, протокол `qmap://`, `mapUrl`, `embed`
2. Phase 3: вікно, клавіша, кнопка в плашці
3. **Перевірити в грі** (quickstart #1–4, #12) — це вже корисно гравцям

### Incremental Delivery

1. US1 → перевірка → злиття
2. US2 (пошук місць у плашці, кадр) → перевірка → злиття
3. US3 («Де я?») → перевірка на 30 кадрах (SC-004) → злиття
4. US4 (офлайн-копія) → перевірка без інтернету → версія 0.4.0 і журнал оновлень → випуск

---

## Notes

- Програма лише показує мапу: жодних записів у мапу (FR-014), жодних дій у грі (FR-015)
- Знімок для «Де я?» — лише в пам'яті головного процесу (FR-010, принцип III)
- Комітити після кожної фази; гілка `014-desktop-map`, у `main` — після зелених тестів
