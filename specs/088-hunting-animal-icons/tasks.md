---

description: "Task list: Тварини на полях полювання"
---

# Tasks: Тварини на полях полювання

**Input**: `specs/088-hunting-animal-icons/` — plan.md, spec.md, research.md, data-model.md, contracts/map-area-animals.md, quickstart.md

**Tests**: обов'язкові за конституцією (принцип VI): SQL-тест прав і check, vitest на чисту логіку розміщення.

**Organization**: фази за user stories. US2 (іконки) іде перед US1, бо US1 малює саме ці іконки; обидві P1.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Створити гілку `088-hunting-animal-icons` від свіжого `main` (не від `map-pin-sizes`) і перенести туди `specs/088-hunting-animal-icons/`
- [X] T002 Перевірити на базі, що міграції до `0068_admin_price_confirm_history.sql` застосовані (сліди: колонки/функції з 0066–0068), перш ніж писати 0069 — `supabase/migrations/`

---

## Phase 2: Foundational (блокує всі історії)

- [X] T003 Міграція `supabase/migrations/0069_map_area_animals.sql`: `alter table public.map_areas add column if not exists animals text[] not null default '{}'`; check `map_areas_animals_ok` — `animals <@ array['rabbit','cow','pig','coyote','deer','puma','panther','boar']` і без повторів (`cardinality(animals) = cardinality(array(select distinct unnest(animals)))`, через immutable-функцію, як `map_ring_ok` у 0021); файл можна запускати повторно (drop constraint if exists → add). RLS не міняти
- [X] T004 [P] SQL-тест `supabase/tests/map_area_animals_test.sql` за зразком `supabase/tests/wiki_test.sql`: anon і `user` не змінюють `animals` (0 рядків); `admin` змінює на `{deer,boar}`; `admin` з `{wolf}` і з `{deer,deer}` — помилка check
- [X] T005 [P] Модуль `src/lib/huntAnimals.ts`: `type AnimalId = 'rabbit'|'cow'|'pig'|'coyote'|'deer'|'puma'|'panther'|'boar'`; `ANIMALS` у порядку з data-model.md (назви: Заєць, Корова, Свиня, Койот, Олень, Пума, Пантера, Кабан; іконки `/icons/animals/<id>.svg`); `isAnimal(s)`; `sortAnimals(ids)` — фільтр невідомих + порядок ANIMALS; `animalSpots(ring, n, stepM)` за research.md R4 — центроїд, якщо поза контуром — найближча точка сітки (крок 1/20 габариту) всередині; ряд із кроком `stepM`, точки поза контуром переносяться в наступний ряд (нижче), детерміновано
- [X] T006 [P] Тест `src/lib/huntAnimals.test.ts` (vitest; контури полів читати через `import.meta.glob('/supabase/seed/map_hunting_fields.sql', { query: '?raw', eager: true })`, не `node:fs`): для кожного з 6 полів і n = 1..8 усі точки всередині контуру, попарна відстань ≥ stepM, повторний виклик дає те саме; `sortAnimals(['boar','wolf','rabbit'])` → `['rabbit','boar']`
- [X] T007 `src/lib/mapData.ts:48` — додати `animals: AnimalId[]` у `MapArea`; `src/lib/mapMarks.ts:70` — `animals: sortAnimals((r.animals as string[] | undefined) ?? [])` (нема колонки → `[]`); виправити місця, що створюють `MapArea` без `animals` (`src/components/MapAreaDraw.tsx` onAdded/onDone) — `npx.cmd tsc --noEmit`

**Checkpoint**: схема, типи й логіка розміщення готові; `npx.cmd vitest run src/lib/huntAnimals.test.ts` зелений.

---

## Phase 3: User Story 2 — Власний набір іконок звірів (P1)

**Goal**: 8 власних іконок звірів, що читаються в розмірі значка в обох темах.

**Independent Test**: 8 іконок поруч розміром ~22 px на світлому й темному тлі — кожну впізнають без підпису; пума/пантера, свиня/кабан не плутаються.

- [X] T008 [P] [US2] `public/icons/animals/rabbit.svg` — заєць: профіль голови з довгими вухами, сіро-бежевий; `viewBox="0 0 512 512"`, тінь-еліпс як у `public/icons/meat/cow.svg`, унікальні id градієнтів (`rabbitg`)
- [X] T009 [P] [US2] `public/icons/animals/cow.svg` — корова: голова анфас, біла з чорними плямами, роги
- [X] T010 [P] [US2] `public/icons/animals/pig.svg` — свиня: рожева голова, великий п'ятачок, без іклів
- [X] T011 [P] [US2] `public/icons/animals/coyote.svg` — койот: гостра морда, гострі вуха, сіро-рудий
- [X] T012 [P] [US2] `public/icons/animals/deer.svg` — олень: голова з розлогими рогами, коричнева
- [X] T013 [P] [US2] `public/icons/animals/puma.svg` — пума: однотонна руда/пісочна кошача голова, світла морда
- [X] T014 [P] [US2] `public/icons/animals/panther.svg` — пантера: чорна кошача голова з жовтими очима, світлий контур для темної теми
- [X] T015 [P] [US2] `public/icons/animals/boar.svg` — кабан: темно-бура голова, щетина на загривку, білі ікла
- [X] T016 [US2] Додати 8 шляхів `/icons/animals/*.svg` у `MAP_ICONS` у `src/data/mapIcons.ts` (FR-010)
- [X] T017 [US2] Перевірити читабельність: тимчасова сторінка в scratchpad з 8 іконками 22/32 px на `#111` і `#f4f1ea`; виправити іконки, що зливаються (SC-002)

**Checkpoint**: іконки готові й доступні адміну серед готових.

---

## Phase 4: User Story 1 — Бачу, які звірі на полі (P1) 🎯 MVP

**Goal**: на мапі сайту й програми всередині поля — іконки його звірів із підказкою, у картці поля — список.

**Independent Test**: увімкнути «Поля полювання» на полі з `animals` (тимчасово позначити SQL-ом адміна) — іконки всередині контуру, підказка «Пума», список у картці; шар вимкнено — іконок немає.

- [X] T018 [US1] _(зроблено інакше: одна плашка на поле, див. research.md R3)_ `src/pages/MapPage.tsx:285` (цикл `for (const ar of areas)`): якщо `ar.animals.length` — для кожної точки `animalSpots(ar.ring, n, STEP_M)` `L.marker(m.unproject(toPx(x, y), ZMAX), { icon: L.divIcon({ className: 'manimal', html: <img src=icon alt="">, iconSize: [22, 22] }), keyboard: false })` з `bindTooltip(назва, { direction: 'top' })`, додати в `layers.current[c.id]` (вимкнений шар → немає звірів). `STEP_M` — метри, що дають ~26 px на `LABEL_ZOOM` (вивести з `PX_PER_M`)
- [X] T019 [US1] Там само в картці зони (`html` попапу): після назви — рядок `<span class="manimals">` з іконкою й назвою кожного звіра (`esc`)
- [X] T020 [US1] Стилі `.manimal` (кружечок кольору категорії через `--c`, біла/темна обводка за темою, `pointer-events` лише на іконці) і `.manimals` у стилях мапи (той файл, де `.mlabel`/`.mlabels-on`); на зумі < `LABEL_ZOOM` (клас `.mlabels-on` знято) `.manimal` ховати (FR-008, SC-005)
- [X] T021 [US1] Перевірити `npx.cmd vite --mode production`: 6 полів на різних масштабах — іконки не налазять на назву поля й мітки інших шарів; поле без звірів виглядає як раніше

**Checkpoint**: MVP — гравець бачить звірів на полях (дані поки внесені вручну).

---

## Phase 5: User Story 3 — Адмін вказує звірів поля (P2)

**Goal**: адмін позначає звірів у «Змінити зону»; 6 полів заповнені за списком власника.

**Independent Test**: адмін додає звіра → після перезавантаження іконка в усіх; не-адмін змінити не може (T004).

- [X] T022 [US3] `src/components/MapAreaDraw.tsx` `MapAreaEdit` (~рядок 59): стан `animals` з `area.animals`; коли `cat === 'hunting-fields'` — група з 8 кнопок-перемикачів (іконка + назва, `aria-pressed`, `role="group"` з `aria-label="Звірі на полі"`); у `update` (~рядок 67) додати `animals: sortAnimals(animals)`, в `onDone` — теж. Для іншої категорії `animals` не чіпати
- [X] T023 [US3] Те саме для нової зони в `MapAreaDraw` (insert), якщо категорія `hunting-fields` — `src/components/MapAreaDraw.tsx`
- [ ] T024 [US3] ⏳ ЧЕКАЄ СПИСКУ ВЛАСНИКА «поле → звірі». Сід `supabase/seed/map_hunting_animals.sql`: `update public.map_areas set animals = '{…}' where category_id = 'hunting-fields' and name = 'Поле полювання N';` для N = 1..6, повторно запускається; назви полів — із `supabase/seed/map_hunting_fields.sql`

**Checkpoint**: адмін керує звірами без релізу; поля заповнені.

---

## Phase 6: User Story 4 — Звірі на мапі для гри (P3)

**Goal**: у мапі для гри на полях — іконки звірів.

**Independent Test**: збирання мапи для гри з увімкненими «Полями полювання» — у попередньому перегляді іконки звірів на полях.

- [X] T025 [US4] `src/components/GameMapExport.tsx:60` (`pins` useMemo): додати піни звірів — для кожної `pickedAreas` з `animals` точки `animalSpots(a.ring, n, sizeOf(a.category) * 1.2)` → `{ x, y, icon: '/icons/animals/<id>.svg', color: catById[a.category].color }` (з `s`, якщо свій розмір категорії ≠ `iconM`, як для міток); залежності useMemo — врахувати `animals`
- [X] T026 [US4] `packSummary` / лічильник у `src/components/GameMapExport.tsx` — піни звірів не рахувати як «мітки» категорії (або рахувати окремо), щоб підсумок не брехав; перевірити `src/lib/gamePreview.test.ts` і `src/lib/gameMap.test.ts` зелені

**Checkpoint**: усі історії працюють.

---

## Phase 7: Polish & Cross-Cutting

- [X] T027 `src/data/changelog.json`: у верхній запис із `"pending": true` (немає — створити новий з `pending`) у `added` — «Мапа: на полях полювання видно, які звірі там водяться» (мовою гравця)
- [X] T028 `npx.cmd tsc --noEmit`, `npx.cmd vitest run`; SQL-тест T004 на базі
- [ ] T029 Застосувати `0069_map_area_animals.sql` і (після T024) `map_hunting_animals.sql` на базі — SQL власнику через буфер обміну, не з чату
- [X] T030 `npm.cmd run build:app`, закрити Q-Hub власника, `cd desktop && npm.cmd start` — перевірити мапу в програмі (quickstart.md §4); переконатися, що в бандлі нема старих .js-копій
- [ ] T031 Пройти `specs/088-hunting-animal-icons/quickstart.md` повністю; комміт + PR у `main`

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → (US2 → US1) → US3 → US4 → Polish.
- US1 залежить від US2 (іконки) і Phase 2. US3 залежить від Phase 2 (схема), UI-частина — від US2. US4 залежить від Phase 2 і US2; від US1 не залежить.
- T024 (сід) блокований списком власника; усе інше — ні. Без T024 функцію можна злити (поля без даних виглядають як раніше), але не випускати пак.

## Parallel Example

```text
Phase 2: T004 (SQL-тест) ‖ T005 (huntAnimals.ts) → T006 (тест)
US2:     T008 ‖ T009 ‖ T010 ‖ T011 ‖ T012 ‖ T013 ‖ T014 ‖ T015
Після US2: US1 (MapPage) ‖ US4 (GameMapExport) — різні файли
```

## Implementation Strategy

1. Phase 1–2 → US2 → US1: MVP, дані внести вручну на одне поле для перевірки.
2. US3: форма адміна; T024, щойно власник дасть список.
3. US4: мапа для гри.
4. Polish, PR; у пак — за командою «випускай».
