# Tasks: Чернетки міток з гри

**Input**: Design documents from `/specs/001-map-pin-drafts/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: включено — їх вимагає конституція, принцип VI: SQL-тест на кожну зміну RLS (дозвіл і заборона, зокрема anon і `user`), модульні тести чистої логіки (`node --test` у програмі, `vitest` на сайті).

**Organization**: фази за історіями. US2 (модерація) іде перед US1 (F9), хоча обидві P1: без бази й модерації чернетці з гри нікуди потрапити, а US2 сама по собі вже корисна (точку ставить admin, сценарій 2.3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можна робити паралельно (інші файли, немає залежності від незавершених задач)
- **[Story]**: US1, US2, US3 — історії зі spec.md

## Path Conventions

- База: `supabase/migrations/`, `supabase/tests/`
- Програма (Electron, CommonJS): `desktop/src/`
- Сайт (React + TS): `src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: місце для тестових знімків і правила інсталятора

- [x] T001 Створити теку `desktop/src/fixtures/map/` з `README.md`: формат `<назва>.png` + `<назва>.json` `{ "x": number, "y": number, "scale_m": number, "note": string }` (x, y — метри гри справжнього місця); правило: лише власні знімки без чату, ніків і чужих міток (принцип III)
- [x] T002 [P] Додати `"!src/fixtures/**"` у `build.files` у `desktop/package.json`, щоб знімки не потрапили в інсталятор
- [x] T003 [P] Покласти 3 знімки від 2026-10-24 (`Знімок екрана 2026-10-24 125818/125825/125835.png`) у `desktop/src/fixtures/map/` як `vinewood-2750.png`, `vinewood-551.png`, `vinewood-28.png` з `.json` (координати гравця — з мапи Q-Hub, поле `note`: «2750 — поза діапазоном», «28 — поза діапазоном»)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: таблиця, бакет, права й RPC — без них не працює жодна історія

**⚠️ CRITICAL**: робота над історіями не починається, доки фаза не завершена

- [x] T004 Написати SQL-тест `supabase/tests/map_drafts_test.sql` за переліком у `contracts/database.md` («Тести»): anon і `user` не бачать і не вставляють; `editor` і `moderator` вставляють лише свої (`author = auth.uid()`, `status = 'new'`), бачать лише свої, RPC → `not_admin`; `admin` бачить усі, `publish_map_draft` створює рядок `map_points` і ставить `point_id`, повтор → `already_processed`, `reject` після `publish` → `already_processed`; повторний `insert` з тим самим `id` → `unique_violation`; `x` без `y` → `check_violation`; `map_points` для `editor` закриті; Storage `map-drafts`: `editor` пише лише в `<свій uid>/…`, читає лише своє, admin читає все. Тест має падати до T005
- [x] T005 Створити міграцію `supabase/migrations/0019_map_drafts.sql` (ідемпотентно: `if not exists`, `drop policy if exists`, `create or replace`): таблиця `public.map_drafts` за `data-model.md` — `id uuid primary key`; `author uuid not null default auth.uid() references public.profiles (id) on delete cascade`; `taken_at timestamptz not null check (taken_at <= now() + interval '10 minutes')`; `created_at timestamptz not null default now()`; `shot text not null`; `x double precision check (x between -6000 and 6800)`; `y double precision check (y between -4400 and 8500)`; `check ((x is null) = (y is null))`; `match jsonb not null default '{}'`; `status text not null default 'new' check (status in ('new','published','rejected'))`; `reviewed_by uuid`, `reviewed_at timestamptz`, `check (status = 'new' or (reviewed_by is not null and reviewed_at is not null))`; `point_id bigint references public.map_points (id) on delete set null`, `check (point_id is null or status = 'published')`; `shot_deleted_at timestamptz`; індекси `(status, created_at desc)` і `(author, created_at desc)`
- [x] T006 У тій самій міграції `supabase/migrations/0019_map_drafts.sql` — RLS: `enable row level security`; select `using (public.is_admin() or author = auth.uid())`; insert `with check (public.is_staff() and author = auth.uid() and status = 'new' and reviewed_by is null and reviewed_at is null and point_id is null and shot_deleted_at is null)`; політик update і delete немає
- [x] T007 У тій самій міграції — бакет `map-drafts` (`public = false`, `file_size_limit = 3145728`, `allowed_mime_types = array['image/jpeg']`, `on conflict (id) do update` як у `0018_training_shots.sql`) і політики `storage.objects`: insert `to authenticated with check (bucket_id = 'map-drafts' and public.is_staff() and split_part(name, '/', 1) = auth.uid()::text)`; select `using (bucket_id = 'map-drafts' and (public.is_admin() or split_part(name, '/', 1) = auth.uid()::text))`; delete `using (bucket_id = 'map-drafts' and public.is_admin())`
- [x] T008 У тій самій міграції — RPC (`language plpgsql security definer set search_path = ''`, `grant execute … to authenticated`, `revoke … from anon`): `public.publish_map_draft(draft uuid, category text, x float8, y float8, name text default '', note text default '') returns bigint` — `raise exception 'not_admin'` якщо не `is_admin()`; `'no_category'` якщо `category` порожня; `'no_point'` якщо `x` або `y` null; `update map_drafts set status='published', reviewed_by=auth.uid(), reviewed_at=now(), x=…, y=… where id=draft and status='new'`, якщо не знайдено — `'already_processed'`; `insert into public.map_points (category_id, name, note, x, y, created_by)` і запис `point_id`; `public.reject_map_draft(draft uuid) returns void` — ті самі `not_admin` / `already_processed`; `public.mark_map_draft_shots_deleted(drafts uuid[]) returns int` — лише admin, лише `status <> 'new' and reviewed_at < now() - interval '30 days' and shot_deleted_at is null`
- [x] T009 Додати виклик `$P -f supabase/tests/map_drafts_test.sql` у `supabase/tests/run.sh` після `map_test.sql`; переконатися, що `bash supabase/tests/run.sh` зелений

**Checkpoint**: база готова; `run.sh` зелений

---

## Phase 3: User Story 2 - Admin публікує або відхиляє чернетку (Priority: P1) 🎯 MVP, частина 1

**Goal**: на сторінці мапи admin бачить чергу чернеток, ставить або пересуває точку, обирає категорію, публікує або відхиляє; editor і moderator бачать лише свої

**Independent Test**: вставити чернетку вручну (SQL або Storage під `editor`), опублікувати під `admin`, перевірити мітку на публічній мапі в анонімному вікні (quickstart, розділ 4)

### Tests for User Story 2

- [x] T010 [P] [US2] Модульні тести `src/lib/mapDrafts.test.ts` (vitest): `statusLabel('new'|'published'|'rejected')` → «Нова» / «Опубліковано» / «Відхилено»; `rpcError(message)` → `already_processed` → «Чернетку вже оброблено», `no_category` → «Оберіть категорію», `no_point` → «Поставте точку на мапі», `not_admin` → «Це може лише адмін», інше — як є; `expiredShots(drafts, now)` повертає лише ті, де `status !== 'new'`, `reviewed_at` старше 30 днів і `shot_deleted_at` порожній

### Implementation for User Story 2

- [x] T011 [P] [US2] Створити `src/lib/mapDrafts.ts`: тип `MapDraft` (поля з `data-model.md`), `statusLabel`, `rpcError`, `expiredShots` (під тести T010); `loadDrafts()` — `supabase.from('map_drafts').select('*, profiles!author(game_name)').order('created_at', { ascending: false })`; `shotUrl(path)` — `storage.from('map-drafts').createSignedUrl(path, 600)`; `publishDraft(...)` і `rejectDraft(id)` через `supabase.rpc`; `purgeExpiredShots(drafts)` — `storage.remove` + `rpc('mark_map_draft_shots_deleted')`
- [x] T012 [US2] Створити `src/components/MapDrafts.tsx`: панель «Чернетки» — список нових від нових до старих (мініатюра знімка, автор `game_name`, час, «точку не визначено», якщо немає координат) (FR-012); вибір чернетки центрує мапу на точці й показує знімок у повному розмірі (сценарій 2.1); для admin — поля категорії (`Select` з наявних `map_categories`), назви, нотатки, кнопки «Опублікувати на карті» (заблокована без точки — сценарій 2.3) і «Відхилити»; для editor/moderator — лише список своїх зі статусом, без кнопок (сценарій 2.6); помилки RPC — через `rpcError`
- [x] T013 [US2] Підключити `MapDrafts` у `src/pages/MapPage.tsx` для `isStaff` з `useAuth()`: маркер вибраної чернетки на мапі, який admin перетягує; клік по мапі в режимі «поставити точку» задає `x, y` через `toGame` з `src/lib/mapGeo.ts`; після публікації мітка з'являється на мапі без перезавантаження; для `user` і гостей панель не рендериться й запит до `map_drafts` не робиться
- [x] T014 [US2] У `src/components/MapDrafts.tsx` під admin при відкритті панелі викликати `purgeExpiredShots` для `expiredShots(drafts, new Date())` (R10); помилка видалення не ламає панель
- [x] T015 [P] [US2] Стилі панелі чернеток у `src/styles.css` у наявному стилі `MapAdmin` (світла й темна тема)

**Checkpoint**: US2 працює окремо — чернетки, вставлені вручну, публікуються й відхиляються

---

## Phase 4: User Story 1 - Поставити точку з великої карти гри одною клавішею (Priority: P1) 🎯 MVP, частина 2

**Goal**: F9 у програмі → знімок → точка (або «точку не визначено») → черга → `map_drafts`; оверлей з результатом

**Independent Test**: quickstart, розділи 2–3: біля відомої мітки F9 → чернетка ≤ 30 м; відмови (без карти, 2750 м, подвійне натискання, `user`, без мережі)

### Tests for User Story 1

- [x] T016 [P] [US1] Тести `desktop/src/outbox.test.cjs` (`node --test`, тимчасова тека): `put` пише `<id>.jpg` + `<id>.json` з `{ id, taken_at, x, y, match }`; `flush` з `send → 'ok'` видаляє пару й повертає `sent`; `'retry'` — лишає; `'denied'` — видаляє й рахує `denied`; два `flush` поспіль не відправляють двічі одну чернетку; пошкоджений `.json` пропускається
- [x] T017 [P] [US1] Тести `desktop/src/mapmatch.test.cjs` для частин без еталона: `scaleBar` на `fixtures/map/vinewood-551.png` → довжина ≈ 208 пікс (±4); `playerIcon` на трьох фікстурах → центр стрілки ±6 пікс від (960, 540), а на кадрі без стрілки → `null`; `checkScale(meters, px)` → `zoom_out` для 2750 м, `zoom_in` для 28 м, ok для 551 м; `toWorld` на синтетичних даних
- [x] T018 [P] [US1] Тести гарячої клавіші в `src/desktop/hotkey.test.ts`: `toAccelerator` для F9 без модифікаторів → `'F9'` (вже дозволено — зафіксувати тестом); нова `pinKeyConflict(pin, barKey, shotKey)` → текст помилки, якщо збігається з клавішею плашки або `Alt+S`, інакше `null`

### Implementation for User Story 1

- [x] T019 [P] [US1] Створити `desktop/src/outbox.cjs` за `contracts/desktop.md`: `outbox(dir, send)` → `{ put(draft, jpeg), flush(), size() }`; `flush` не запускається вдруге, поки йде попередній; `id` — `crypto.randomUUID()` у `put`
- [x] T020 [P] [US1] Додати `pinKeyConflict` у `src/desktop/hotkey.ts` (під T018)
- [x] T021 [P] [US1] Створити `desktop/src/mapref.cjs`: завантаження `${cfg.site}/map/game/export.bin` і `export.json` у `%APPDATA%\Q-Hub\map\` з `If-None-Match` / `etag`; без мережі — кеш; без кешу й мережі → `null` (тоді F9 дає «точку не визначено»); `parse(buf, meta)` → `{ n, xy: Uint16Array, col: Uint8Array, palette, q }` (формат як `drawTris` у `src/lib/gameMap.ts`: `n` uint32, далі `n*6` uint16, далі `n` uint8)
- [x] T022 [US1] Створити `desktop/src/mapmatch.cjs` — частина без еталона: `MASK(w, h)` (R4: права панель x ≥ 1530 & y ≤ 830, рядок підказок y ≥ 1020, шкала й район x ≤ 270 & y ≥ 920, перехрестя ±4 пікс; усе × `h/1080`); `scaleBar(frame)` — найдовша біла горизонтальна лінія в зоні шкали → `{ px, region }` (ділянка для OCR числа); `playerIcon(frame)` — зв'язні червоні області (R > 180, G < 110, B < 110), площа 40–400 пікс × `(h/1080)²`, заповненість 0,35–0,65, поза маскою; рівно одна → `{x, y}`, інакше `null`; `checkScale(meters, px)` — 100–1000 м (R2); `toWorld(...)`. Тести T017 мають пройти
- [x] T023 [US1] Модуль `desktop/src/mapmatch.cjs` віддає `{ kind: 'unsure' }` замість координат, доки немає зіставлення (його додасть T031): `locate(frame, ref, scaleMeters)` повертає `no_map` | `no_player` | `zoom_in` | `zoom_out` | `unsure`
- [x] T024 [US1] У `desktop/src/main.cjs`: роль — `sb.from('profiles').select('role').eq('id', uid)` після входу й кожні 10 хв; `registerPinKey()` реєструє `prefs().pinKey` (за замовчуванням `'F9'` у `BAR_DEFAULTS`) лише для `editor`/`moderator`/`admin`, інакше `globalShortcut.unregister` (FR-001, сценарій 1.4); при виході — зняти
- [x] T025 [US1] У `desktop/src/main.cjs` обробник `pinKey`: ігнор, якщо від попереднього < 5 с (FR-009); `captureFrame()` (з урахуванням монітора гри — як `captureShot`, монітор під курсором); OCR числа шкали наявним цифровим воркером (білий список `0123456789m`); `locate` у `worker_threads` (`desktop/src/mapmatch.worker.cjs`); для `point` / `unsure` — `outbox.put(draft, img.toJPEG(80))` і `flush()`; для `no_map` / `no_player` / `zoom_*` — без чернетки; результат — у плашку
- [x] T026 [US1] У `desktop/src/main.cjs` функція `send(draft, jpeg)` для `outbox` за `contracts/database.md`: `storage.upload('<uid>/<id>.jpg', { upsert: false })` (дубль / 409 = успіх) → `from('map_drafts').insert({ id, taken_at, shot, x, y, match })` (`23505` = успіх); `42501` / RLS / 403 → `'denied'`; мережа → `'retry'`; `setInterval(flush, 30e3)`
- [x] T027 [US1] Оверлей: подія `'pin'` у `desktop/src/preload.cjs` (`onPin`), показ плашки через `bar.showInactive()` без фокусу; у `src/desktop/Bar.tsx` — вигляд-повідомлення з текстами з таблиці «Оверлей» у `contracts/desktop.md`, автоприховування через 3 с
- [x] T028 [US1] Налаштування клавіші: поле «Клавіша мітки» в налаштуваннях `src/desktop/Bar.tsx` (запис комбінації через `toAccelerator`, перевірка `pinKeyConflict`); у `barPrefs()` в `desktop/src/main.cjs` — `pinKey`: `globalShortcut.register`, при невдачі повернути стару й помилку «… не вийшло зайняти» (FR-010); поле видно лише staff

**Checkpoint**: F9 створює чернетки «точку не визначено» зі знімком; US2 їх обробляє — повний MVP із ручною точкою

### Зіставлення (R1, R5, R6) — точка автоматично

- [x] T029 [US1] Тести зіставлення в `desktop/src/mapmatch.test.cjs`: на кожній фікстурі з робочим масштабом `locate` дає точку ≤ 30 м від `.json` або `unsure`; жодної точки > 100 м; синтетичний тест — еталон, перефарбований в іншу палітру (інвертовані кольори), дає ту саму точку (палітра не впливає)
- [x] T030 [US1] Растеризатор у `desktop/src/mapmatch.cjs`: `renderRef(ref, mPerPx, bbox)` → сірий растр (трикутники `xy / q` у кадрі `GAME` — x0 −4140, yt 8400; колір = яскравість палітри); `edges(gray, mask)` — модуль градієнта Собеля, нормований, маска обнуляє закриті ділянки
- [x] T031 [US1] Пошук у `desktop/src/mapmatch.cjs`: грубо — еталон і знімок на 16 м/пікс, NCC через FFT (власна radix-2 FFT, розмір до 1024²), 5 найкращих піків з придушенням сусідів у радіусі 150 м; точно — кожен кандидат на 2 м/пікс прямим NCC у вікні ±64 м; результат: позиція центру кадру в метрах → плюс зсув іконки гравця × масштаб → `{x, y}`; поріг R5: `score ≥ 0.35` і `best / second ≥ 1.25`, інакше `unsure`; `match = { scale_m_per_px, score, ratio, screen, version }`
- [x] T032 [US1] `desktop/src/mapmatch.worker.cjs`: еталон з `mapref` парситься й растр 16 м/пікс будується один раз на запуск; час `locate` на 1920×1080 ≤ 1,5 с — заміряти й записати в `vision.log`
- [ ] T033 [US1] Зібрати 20+ власних знімків великої карти біля відомих міток (масштаби 100–1000 м, різні райони, щонайменше один — з нестандартною палітрою) у `desktop/src/fixtures/map/` і підібрати пороги R5 так, щоб T029 давав ≥ 90% точок у межах 30 м і ≤ 2% > 100 м (SC-002, SC-003); пороги — константами вгорі `desktop/src/mapmatch.cjs` з коментарем, на якому наборі підібрано

**Checkpoint**: US1 повністю — F9 дає точку автоматично

---

## Phase 5: User Story 3 - Не плодити дублікатів (Priority: P2)

**Goal**: перед публікацією admin бачить опубліковані мітки тієї ж категорії й інші нові чернетки в радіусі 30 м

**Independent Test**: дві чернетки біля однієї точки → у кожній попередження з посиланням на іншу (quickstart, розділ 4, крок 5)

- [x] T034 [P] [US3] Тести в `src/lib/mapDrafts.test.ts`: `nearby(point, category, points, drafts, selfId, r = 30)` повертає мітки тієї ж категорії й нові чернетки (будь-якої категорії, крім самої себе) на відстані ≤ 30 м і не повертає 30,1 м; сортування за відстанню
- [x] T035 [US3] Реалізувати `nearby` у `src/lib/mapDrafts.ts` (евклідова відстань у метрах гри)
- [x] T036 [US3] У `src/components/MapDrafts.tsx` при відкритті чернетки й зміні категорії — попередження «Поруч уже є: <назва>» (клік центрує мапу на тому, що поруч); кнопки «Опублікувати» й «Відхилити» лишаються доступні (сценарій 3.1, FR-017)

**Checkpoint**: усі історії працюють

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T037 [P] Пройти `specs/001-map-pin-drafts/quickstart.md` повністю на тестовій базі й позначити результати; невідповідності — окремими задачами
- [ ] T038 [P] Оновити `README.md` (розділ програми): F9 для editor/moderator/admin, де змінити клавішу, що знімок бачать лише admin і автор
- [ ] T039 Підняти версію програми в `desktop/package.json` (0.2.0 → 0.3.0) і перевірити, що `npm.cmd test` (сайт), `cd desktop; npm.cmd test` і CI `deploy.yml` зелені

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → без залежностей
- **Foundational (2)** → після Setup; блокує всі історії
- **US2 (3)** → після Foundational
- **US1 (4)** → після Foundational; T019–T028 можна паралельно з US2, але end-to-end перевірка потребує US2 (переглянути чернетку можна й прямо в базі)
- **US3 (5)** → після US2 (розширює `MapDrafts.tsx`)
- **Polish (6)** → після потрібних історій

### Within Each Story

- тести → реалізація (тест має впасти до реалізації)
- US1: T019–T028 (чернетка без точки) → T029–T033 (зіставлення)
- T004 → T005–T008 (одна міграція — послідовно) → T009

### Parallel Opportunities

- T002, T003 — паралельно після T001
- US2: T010 і T015 паралельно; T011 паралельно з T010
- US1: T016, T017, T018 паралельно; T019, T020, T021 паралельно
- US2 (сайт) і US1 T019–T028 (програма) — різні файли, паралельно

---

## Parallel Example: User Story 1

```text
Task: "T016 [US1] Тести outbox у desktop/src/outbox.test.cjs"
Task: "T017 [US1] Тести шкали й іконки в desktop/src/mapmatch.test.cjs"
Task: "T018 [US1] Тести клавіші в src/desktop/hotkey.test.ts"

Task: "T019 [US1] outbox у desktop/src/outbox.cjs"
Task: "T020 [US1] pinKeyConflict у src/desktop/hotkey.ts"
Task: "T021 [US1] mapref у desktop/src/mapref.cjs"
```

## Parallel Example: User Story 2

```text
Task: "T010 [US2] Тести src/lib/mapDrafts.test.ts"
Task: "T011 [US2] src/lib/mapDrafts.ts"
Task: "T015 [US2] Стилі панелі в src/styles.css"
```

---

## Implementation Strategy

### MVP

1. Phase 1 + Phase 2 → `run.sh` зелений.
2. Phase 3 (US2) → модерація з чернетками, вставленими вручну. **Стоп, перевірка.**
3. Phase 4 до чекпоінту після T028 → F9 дає чернетку «точку не визначено», admin ставить точку сам. **Це вже робочий MVP:** редактор не шукає місце на мапі, admin бачить знімок.
4. T029–T033 → точка автоматично. Найризикованіша частина, тому остання: якщо пороги SC-002/SC-003 не досягаються, MVP із п. 3 лишається робочим.

### Incremental Delivery

- Після п. 2 — деплой сайту (без змін у програмі).
- Після п. 3 — тестова збірка програми 0.3.0 для editor/moderator.
- Після п. 4 — збірка з автоматичною точкою.
- US3 — у будь-який момент після п. 2.
