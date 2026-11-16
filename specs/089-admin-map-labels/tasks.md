---

description: "Task list: Назви на мапі від адміна"
---

# Tasks: Назви на мапі від адміна

**Input**: `specs/089-admin-map-labels/` — plan.md, spec.md, research.md, data-model.md, contracts/map-labels.md, quickstart.md

**Tests**: обов'язкові за конституцією (принцип VI): SQL-тест прав і обмежень `map_labels`, vitest на чисту логіку напису.

**Organization**: US2 (прибрати старі назви) і US1 (адмін ставить написи) — обидві P1; US2 іде першою, бо простіша й одразу дає результат, US1 від неї не залежить. US3 (архів гри) спирається на рендерер із Phase 2. US4 (правка/видалення) — P2.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Гілка `089-admin-map-labels` від свіжого `origin/main`; перенести туди `specs/089-admin-map-labels/`
- [X] T002 Перевірити на базі, що 0069 (`map_areas.animals`) застосована (публічним ключем `map_areas?select=animals&limit=1` без помилки), перш ніж писати 0070

---

## Phase 2: Foundational (блокує всі історії)

- [X] T003 Міграція `supabase/migrations/0070_map_labels.sql`: таблиця `public.map_labels` за data-model.md — `text` «1–40 символів після trim, без переносів рядка» (`check (length(btrim(text)) between 1 and 40 and text !~ '[\r\n]')`); `x, y double precision` «у межах мапи (x −6000…6800, y −4400…8500)»; `color` і `outline_color` «`^#[0-9a-f]{6}$`»; `font` «`^[a-z0-9-]{2,40}$`», default `'roboto-condensed'`; `weight int` «100…900, кратне 100», default 700; `outline_w real` «0…20», default 3; `angle real` «−180…180», default 0; `size real` «5…400», default 30; `created_by uuid default auth.uid()`, `created_at`, `updated_at` (тригер на update). RLS: `select using (true)`; `all using (public.is_admin()) with check (public.is_admin())`; `grant select to anon, authenticated`. Файл повторно запускається (`if not exists`, `drop policy if exists`)
- [X] T004 [P] SQL-тест `supabase/tests/map_labels_test.sql` (стиль `supabase/tests/map_areas_test.sql`, свої uuid `…a4`/`…b4`): admin вставляє «ФЕРМА»; anon і `user` бачать, але insert → `insufficient_privilege`, update/delete не змінюють; `editor` (`…0a`) — так само; admin: text `''`, 41 символ, з `\n`, color `'red'`, size 4 і 401, angle 181, weight 750, x 99999 → `check_violation`; прибрати за собою. Додати рядок `$P -f supabase/tests/map_labels_test.sql` у `supabase/tests/run.sh` після `map_area_animals_test.sql`
- [X] T005 [P] `src/lib/labelFonts.ts`: `LABEL_FONTS` — ~25 Google Fonts з кирилицею у Fontsource (`{ id: 'roboto-condensed', name: 'Roboto Condensed', weights: [400, 700] }`, Oswald, Montserrat, Rubik, Russo One, Unbounded, PT Sans Narrow, Exo 2, Comfortaa, Lobster, Pacifico, Roboto Slab, Ubuntu, Play, Philosopher, Jura, Marck Script, Caveat, Neucha, Ruslan Display, Kelly Slab, Seymour One, Press Start 2P, Yeseva One, Alice — лишити лише ті, що мають `cyrillic` у Fontsource); `fontUrl(id, subset, weight)` = `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/${subset}-${weight}-normal.woff2`; `loadLabelFont(id, weight, timeoutMs = 4000): Promise<boolean>` — два `FontFace` (latin, cyrillic з `unicodeRange`), `document.fonts.add`, кеш промісів; `fontFamily(id, weight)` → ім'я сімейства для canvas (`'QL-<id>-<weight>'`)
- [X] T006 [P] `src/lib/mapLabel.ts`: тип `MapLabel` (data-model.md); `labelBox(l, widthM)` → 4 кути повернутого прямокутника (центр `x,y`, ширина `widthM`, висота `size·1.25` з обводкою) і вісь-вирівняний `{x0,y0,x1,y1}` (y гри вгору, кут проти годинникової); `renderLabel(l, pxPerM, family)` → `{ canvas, box }`: виміряти `measureText` при `font = ${weight} ${size·pxPerM}px ${family}`, canvas розміром осьового бокса, `translate`→`rotate(-angle)`, `strokeText` (`lineWidth = 2·outlineW·pxPerM`, `lineJoin='round'`, лише якщо `outlineW > 0`), потім `fillText`, `textAlign='center'`, `textBaseline='middle'`; `labelRuns(canvas, box)` → смужки в метрах гри (як `iconRuns` у `src/lib/gameMap.ts:78`, квантування кольору кроком 24, alpha < 128 — пропуск); `splitBySupertile(runs)` → `Map<'c_r', runs>` за центром смужки (`supertileOf` з `src/lib/gameMap.ts:64`)
- [X] T007 [P] Тест `src/lib/mapLabel.test.ts` (vitest, без canvas — лише чиста геометрія й розбиття): `labelBox` для кута 0 і 90 (ширина/висота міняються місцями), кути при 45°; `splitBySupertile` кладе смужки по обидва боки межі частин у різні ключі; смужки з однаковим кольором поруч — одна (через фейковий масив пікселів)
- [X] T008 `src/lib/mapData.ts`: експорт `MapLabel` (re-export з `mapLabel.ts`); `src/lib/mapMarks.ts` `loadMapData` (рядок ~61): паралельно `supabase.from('map_labels').select('*').order('id')`; у результаті `labels: error ? null : rows → MapLabel` (snake → camel: `outline_color → outlineColor`, `outline_w → outlineW`); тип `MapData` + `labels`. `src/desktop/mapCache.ts` `readCopy`: `labels` не масив → `[]` (стара копія). Тест у `src/desktop/mapCache.test.ts`: копія без `labels` читається з `[]`

**Checkpoint**: схема, шрифти, рендер і дані готові; `npx.cmd vitest run src/lib/mapLabel.test.ts src/desktop/mapCache.test.ts` зелений.

---

## Phase 3: User Story 2 — Старі назви прибрано (P1)

**Goal**: старого шару назв немає ніде.

**Independent Test**: мапа сайту, програма, перегляд і архів «Мапи для гри», «Скрін» — жодного старого напису.

- [X] T009 [P] [US2] `src/lib/mapVector.ts`: видалити `namesLayer`, `getNames` і пов'язане (рядки ~51–120); прибрати імпорт/виклик у `src/pages/MapPage.tsx:9,305-306` і `src/components/GamePreview.tsx:6,35-37` (pane `names` лишити — туди підуть написи)
- [X] T010 [P] [US2] `src/lib/gameMap.ts`: прибрати малювання `names.bin` у `drawMap` (рядки 223–224); `GAME_LAYERS` (рядок 335) — без `names` (лише `zones`), тип `GameLayer` = `'names' | 'zones'` лишається для вибору, але `buildGamePack` (рядок 376) тягне zip лише для `zones`; прибрати `namesPalette` з `meta` (рядок 186)
- [X] T011 [P] [US2] `src/pages/MapPage.tsx:14,179` і `src/components/GameMapExport.tsx:6,13`: прибрати імпорт `mapLabels.json`; лічильник «Назви» = `labels.length` з даних мапи (MapPage) / з пропа `labels` (GameMapExport)
- [X] T012 [US2] `desktop/src/qmap.cjs`: не віддавати/не кешувати `names.bin` (коментар рядок 2 і список файлів); `desktop/src/qmap.test.cjs` — оновити очікування
- [X] T013 [US2] Видалити `src/data/mapLabels.json`, `public/map/game/names.bin`, `public/map/game/names.zip`; з `public/map/game/export.json` прибрати `namesPalette` (Node, JSON без зміни решти); `src/lib/mapBrand.test.ts` — позиція «ЧІЛІАД» сталими числами (`x 674.7, y 5537.4, h 35`) замість json; `scripts/minimap/hydra_names.py` — помітка вгорі, що вихід більше не використовується (specs/089)
- [X] T014 [US2] `npx.cmd tsc --noEmit`, `npx.cmd vitest run`, `cd desktop && node --test --test-force-exit src/*.test.cjs` — зелені

**Checkpoint**: мапа скрізь без назв.

---

## Phase 4: User Story 1 — Адмін додає напис (P1) 🎯 MVP

**Goal**: адмін ставить напис зі стилем, кутом і розміром; усі бачать.

**Independent Test**: адмін додає «ФЕРМА» (Oswald, жовтий, чорна обводка, 30°, 60 м) → гість після перезавантаження бачить те саме.

- [X] T015 [US1] `src/lib/mapMarks.ts`: `labelLayer(l, ll)` → `L.imageOverlay(canvas.toDataURL(), bounds(box), { interactive, pane: 'names' })` з `renderLabel(l, 4, family)` (4 px/м — чітко до ZMAX+2); спершу шрифт `loadLabelFont`, не вдалося — `sans-serif`, а коли прийде — перемалювати (`setUrl`)
- [X] T016 [US1] `src/pages/MapPage.tsx` (цикл шарів, де були назви ~рядок 305): для кожного `labels` → `labelLayer` у `layers.current.names`; стан `labels` з `apply(d)` (як `areas`); адміну клік по напису — попап з назвою й кнопками «Змінити / перенести», «Видалити напис» (US4 підключить дії)
- [X] T017 [US1] `src/components/MapLabelEdit.tsx`: форма (видимі підписи, verb-first кнопки): «Текст» (maxLength 40), «Колір тексту» (`input type=color`), «Шрифт» (`Select` з `LABEL_FONTS`, назва показана самим шрифтом), «Товщина» (вага з `weights`), «Колір обводки», «Товщина обводки, м» (0…20), «Кут, °» (−180…180, число + повзунок), «Розмір, м» (5…400, число + повзунок); `onChange(draft)` — наживо; «Зберегти напис» → `insert` (новий) / `update` (наявний) у `map_labels`; помилки RLS → «Це може лише адмін.», нема таблиці → «запусти міграцію 0070_map_labels.sql»
- [X] T018 [US1] `src/pages/MapPage.tsx`: інструменти адміна → кнопка «Новий напис» → наступний клік по мапі ставить точку → `MapLabelEdit` у панелі адміна; живий напис-чернетка (`labelLayer` з draft, перемальовується на `onChange`); ручки (`L.marker` draggable, як ручки правки зон ~рядок 342): центр — переносить `x,y`; кутова (на правому верхньому куті `labelBox`) — поворот = кут вектора від центру, розмір = відстань / початкова відстань × size (обмежити 5…400)
- [X] T019 [US1] Стилі форми й ручок у `src/styles.css` (поруч `.madmin`, `.mdr-pin`): `.mlabel-edit`, `.mlabel-h` (кутова ручка)
- [ ] T020 [US1] Перевірити наживо (`npx.cmd vite --mode production`, після T029 — на базі з 0070): додати, побачити гостем

**Checkpoint**: MVP — адмін ставить назви на мапі сайту й програми.

---

## Phase 5: User Story 3 — Написи в архіві для гри (P1)

**Goal**: написи на великій мапі (пауза) і на радарі, як на сайті; розмір значків не впливає.

**Independent Test**: архів з розмірами значків 5 і 20 м — написи однакові; у грі видно і в паузі, і на радарі.

- [X] T021 [US3] `src/components/GamePreview.tsx`: пропс `labels` → ті самі `labelLayer` у pane `names` (коли увімкнено «Назви»)
- [X] T022 [US3] `src/lib/gameMap.ts` `drawMap`: параметр `labels: MapLabel[]`; на місці старих назв — для кожного `renderLabel(l, pxPerM = size_px / GAME.tile, family)` → `ctx.drawImage(canvas, ...gamePx(box.x0, box.y0))` у розмірі бокса; `mapShot` і `textures` передають `labels`
- [X] T023 [US3] `src/lib/gameMap.ts`: `labelFiles(labels)` — `renderLabel(l, 1.5, family)` → `labelRuns` → `splitBySupertile` → `IconMesh` чотирикутники на висоті назв (z 20.0, як старий шар `tile_3_N`) → `meshFiles(out, k, 'supertile_fore_${k}_tile_3_${part}', m)`, дробити по 60 000 вершин; у `buildGamePack` (рядок ~380) — `raw.push(...await labelFiles(labels))`, коли в `opt.layers` є `names`; мінімальна обводка на радарі 1 м (`max(outlineW, 1)`)
- [X] T024 [US3] `src/lib/gameMap.ts`: перед збиранням (і `mapShot`) — `await Promise.all(labels.map(l => loadLabelFont(l.font, l.weight)))`; будь-який `false` → помилка «Не вдалося завантажити шрифт <name> — перевір інтернет і спробуй ще» (архів не збирається)
- [X] T025 [US3] `src/components/GameMapExport.tsx`: пропс `labels` (з MapPage), передати в `GamePreview`, `buildGamePack(..., { labels })`; `packSummary` (`src/lib/gamePreview.ts`) — «назви: N»; `src/components/MapShot.tsx` — `labels` у `mapShot`
- [ ] T026 [US3] Перевірити: перегляд «Мапи для гри» = мапа сайту; зібрати архів з iconM 5 і 20 — порівняти текстури (написи однакові); у zip немає старих `names.zip`-файлів, є `tile_3_N` з написами; `src/lib/gameMap.test.ts`, `src/lib/gamePreview.test.ts` зелені (оновити очікування `GAME_LAYERS`)

**Checkpoint**: написи в архіві для гри.

---

## Phase 6: User Story 4 — Змінити, перенести, видалити (P2)

**Goal**: адмін правит і видаляє наявні написи.

**Independent Test**: змінити колір і кут, перенести, видалити інший — після перезавантаження видно всім.

- [X] T027 [US4] `src/pages/MapPage.tsx`: «Змінити / перенести» з попапу → той самий `MapLabelEdit` з наявним написом + ручки (T018); збереження → `update`, стан `labels` оновлюється без перезавантаження
- [X] T028 [US4] «Видалити напис» → підтвердження `Видалити напис «<text>»?` (назва в діалозі) → `delete` → прибрати з `labels`

**Checkpoint**: усі історії працюють.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T029 Застосувати `0070_map_labels.sql` на базі — SQL власнику через буфер обміну; перевірити публічним ключем `map_labels?select=id` → `[]`
- [X] T030 `src/data/changelog.json`: верхній `pending`-запис (немає — створити з `pending: true`): у `changed` — «Мапа (Alt+M) і мапа для гри: назви місць тепер ставить адмін — свій текст, шрифт, колір, обводка, поворот і розмір; старі назви прибрано»
- [X] T031 `npm.cmd run build:app`; закрити Q-Hub власника; `cd desktop && npm.cmd start` — Alt+M показує написи; бандл без `names.bin`
- [ ] T032 Пройти `specs/089-admin-map-labels/quickstart.md`; комміт + PR у `main` (перед push перевірити, що PR ще відкритий)

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US2 → US1 → US3 → US4 → Polish.
- US2 залежить лише від Phase 2 (T008 — лічильник з `labels`). US1 — від Phase 2 (рендер, шрифти, дані). US3 — від Phase 2 і T015 (`labelLayer` для перегляду); від редактора не залежить. US4 — від US1 (форма й ручки).
- T029 (міграція на базі) потрібна для живої перевірки US1/US4, не для коду.

## Parallel Example

```text
Phase 2: T004 (SQL-тест) ‖ T005 (шрифти) ‖ T006 (рендер) → T007 (тест)
US2:     T009 (mapVector) ‖ T010 (gameMap) ‖ T011 (лічильники)
Після T015: US3 (GamePreview/gameMap) ‖ US1-редактор (MapPage/MapLabelEdit)
```

## Implementation Strategy

1. Phase 1–2 → US2: старі назви зникли (можна злити окремо — мапа просто без назв).
2. US1: адмін ставить написи на сайті й у програмі (MVP).
3. US3: написи в архіві для гри — пауза й радар.
4. US4, Polish, PR; у пак — за командою «випускай».
