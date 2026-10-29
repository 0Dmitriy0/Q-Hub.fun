---

description: "Задачі: нік акаунта й персонажі зі своїм статіком"
---

# Tasks: Нік акаунта й персонажі зі своїм статіком

**Input**: `/specs/025-account-nick-characters/` — plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: обов'язкові за конституцією (VI): SQL-тест прав і тригерів (`supabase/tests/account_nick_test.sql`),
`node --test` для `parseNick`, `vitest` для перевірки ніка на сайті, зведень оновлень і вибору персонажа.

**Увага**: код з регулярними виразами (`\d`, `\D`, `\s`) — лише через Edit/Write, не скриптом із шаблонним рядком
(так у 0.4.7 загубились «\» у полі статіку).

## Phase 1: Setup

- [ ] T001 Створити `supabase/migrations/0038_account_nick_characters.sql` (заголовок-коментар: що й навіщо, specs/025) і `supabase/tests/account_nick_test.sql`; додати рядок запуску тесту в `supabase/tests/run.sh` за зразком інших тестів

---

## Phase 2: Foundational — база (блокує всі історії)

**Мета**: правила в базі (конституція II); сумісно зі старими клієнтами, тож може вийти першою.

- [ ] T002 SQL-тест `supabase/tests/account_nick_test.sql` за `contracts/db.md` «Тест має перевірити»: anon не читає `characters` і не пише `profiles.nick`; `user` — свій нік так, чужий ні; «D_VYRX» і «d_vyrx» — зайнято; друга зміна за 30 днів — відмова, `admin` — можна; 4-й персонаж — відмова; зайнятий статік — відмова; ім'я `saha_23` — відмова; ціна з чужим `character_id` — відмова; без `character_id` при двох персонажах — відмова, при одному — підставлено; без ніка — ціна не приймається; видалений персонаж — ціна лишилась з `character_id` null; у `price_updates` і `contributors` немає стовпців `reporter_static`, `static_id`, `game_name`
- [ ] T003 Міграція, профіль: `profiles.nick text` з `check (nick ~ '^[A-Za-z0-9_]{3,20}$')`, унікальний індекс `lower(nick)`, `profiles.nick_changed_at timestamptz`, `grant update (nick) on public.profiles to authenticated`; тригер `before update of nick`: старий `nick` не null і `nick_changed_at > now() - interval '30 days'` і не `admin` → виняток «Нік можна змінити знову з DD.MM.YYYY.», інакше `nick_changed_at := now()`; унікальність — виняток «Нік «…» уже зайнятий.» (research R1–R2) у `supabase/migrations/0038_account_nick_characters.sql`
- [ ] T004 Міграція, персонажі: `characters.static_id integer unique check (static_id between 1 and 999999999)`; `check (name ~ '^[A-Z][a-zA-Z]{1,14}_[A-Z][a-zA-Z]{1,14}$') not valid`; тригер `before insert`: `count(*) where owner = new.owner >= 3` → «В акаунті вже 3 персонажі.»; дубль статіку → «Статік … уже має інший персонаж.» (R3–R4) у `supabase/migrations/0038_account_nick_characters.sql`
- [ ] T005 Міграція, ціни: `price_reports.character_id uuid references public.characters on delete set null`; нова версія `check_buyer_report()` від 0036 (межі для `source = 'desktop'`, ліміт 120/год, виправлення за 10 хв — без змін) з перевіркою автора за `data-model.md` (нік; свій персонаж зі статіком; один персонаж — підставити; 0 — «Спершу додай персонажа.»; 2–3 — «Обери персонажа, з якого вписуєш ціну.»); ті самі перевірки автора в `set_next_change` (0009) і `report_unknown_item` (0029) у `supabase/migrations/0038_account_nick_characters.sql`
- [ ] T006 Міграція, зведення: `drop view` + `create view` для `price_updates` (`reporter_id`, `reporter_name` = `coalesce(nick, name)`, `reporter_character` = `characters.name`, без `reporter_game`/`reporter_static`), `contributors` (`name` = `coalesce(nick, name)`, без `game_name`/`static_id`, рахунок на акаунт), `buyer_next_change` (нік, без статіку), `map_owners` (з `characters`: `static_id`, `name as game_name`); гранти `select` для anon і authenticated як були (R6) у `supabase/migrations/0038_account_nick_characters.sql`
- [ ] T007 Міграція, перенесення (ідемпотентно, R7): `characters.static_id` ← `profiles.static_id` персонажу з `name = game_name`, інакше найстаршому, лише де `static_id is null` і статік ще вільний; `price_reports.character_id` ← персонаж акаунта зі статіком, інакше найстарший, лише де null; `profiles.nick` не заповнювати; `game_name`/`static_id` профілю не видаляти у `supabase/migrations/0038_account_nick_characters.sql`

**Checkpoint**: тест T002 зелений у CI (`bash supabase/tests/run.sh`).

---

## Phase 3: User Story 1 — Персонаж зі своїм Ім'ям_Прізвищем і статіком (P1) 🎯 MVP

**Мета**: другий персонаж не перезаписує статік першого.
**Independent Test**: два персонажі з різними статіками → у кожного свій статік, облік і склад; статік першого не змінився.

- [ ] T008 [P] [US1] `desktop/src/main.cjs`: `char-add` пише `static_id` у `characters` (`insert({ name, static_id: stat, start_balance: start })`), профіль не чіпає; відмови бази («уже має інший персонаж», «вже 3 персонажі») — гравцю як є; `state()` віддає `characters: [{ id, name, static: static_id }]`
- [ ] T009 [P] [US1] `desktop/src/renderer.js`, `desktop/src/index.html`: плитка — Ім'я_Прізвище і «#статік»; «+ Новий» ховається, коли персонажів 3; підстановку статіку з профілю (`s.user.staticId`) прибрати
- [ ] T010 [P] [US1] `src/lib/auth.tsx`: персонажі з `static_id`; `src/pages/cabinet/Characters.tsx`: поле «Статік» (лише цифри, `#` і пробіли допустимі), список зі статіком (бачить лише власник), повідомлення при 3 персонажах; формат імені — як у `desktop/src/character.cjs`

**Checkpoint**: quickstart рядки 2–4.

---

## Phase 4: User Story 2 — Нік акаунта (P1)

**Мета**: людина в Q-Hub — це нік, який вона вибрала сама; на сайті скрізь лише він.
**Independent Test**: новий акаунт → вибирає нік → шапка програми й рейтинг сайту показують нік, без статіку.

- [ ] T011 [P] [US2] `desktop/src/nick.cjs` + `desktop/src/nick.test.cjs`: `parseNick(s)` — trim, `^[A-Za-z0-9_]{3,20}$`, `{ nick }` або `{ error }` українською; тести: «D_VYRX», «ab» (закоротко), «d vyrx», кирилиця, 21 символ
- [ ] T012 [P] [US2] `src/lib/nick.ts` + `src/lib/nick.test.ts`: та сама перевірка для сайту (той самий вираз, коментар-посилання на `desktop/src/nick.cjs`)
- [ ] T013 [US2] `desktop/src/main.cjs` + `desktop/src/preload.cjs`: IPC `nick-set` (лише з вікна входу й плашки) → `update profiles set nick`; `state()` і `bar-data` — `user.nick`, `user.nickChangedAt`, без `gameName`/`staticId` (contracts/desktop-ipc.md)
- [ ] T014 [US2] `desktop/src/index.html`, `desktop/src/renderer.js`: крок «Нік у Q-Hub» перед персонажами, коли `nick` null; помилка бази («зайнятий», «можна знову з …») — під полем
- [ ] T015 [US2] `src/desktop/Bar.tsx`: шапка — аватар, нік, під ним «Ім'я_Прізвище #статік» вибраного персонажа; меню персонажів — Ім'я_Прізвище і статік; `src/desktop/Settings.tsx` — FAQ «Як змінити нік» (раз на 30 днів)
- [ ] T016 [US2] `src/lib/auth.tsx`: `nick`, `nickChangedAt`, `saveNick`; прибрати `gameName`, `staticId`, `saveProfile`; `src/components/StaticGate.tsx` → `src/components/NickGate.tsx` (ворота — нік, форма з «можна знову з …»), оновити імпорти в `src/components/Layout.tsx`, `src/desktop/Hub.tsx`, `src/pages/cabinet/SettingsPage.tsx`
- [ ] T017 [P] [US2] Нік замість Discord-імені й профільного ніка: `src/components/Leaderboard.tsx`, шапка `src/pages/cabinet/Cabinet.tsx`, автор чернетки `src/lib/mapDrafts.ts` (`who:profiles!author(nick,name)`, `authorName`) + `src/lib/mapDrafts.test.ts`

**Checkpoint**: quickstart рядки 1, 5, 8.

---

## Phase 5: User Story 3 — Ціна від персонажа (P2)

**Мета**: у кожній ціні — нік і персонаж; ручна ціна при 2–3 персонажах питає персонажа.
**Independent Test**: акаунт з двома персонажами — «зір» пише від вибраного; ручна ціна — діалог вибору; у «Останніх оновленнях» «нік · Ім'я_Прізвище».

- [ ] T018 [P] [US3] `src/lib/updates.ts` + `src/lib/updates.test.ts`: тип `Update` — `reporter_id`, `reporter_name`, `reporter_character`; групування за `reporter_id`; `who()` → «нік · Ім'я_Прізвище»; без `reporter_static`/`reporter_game`
- [ ] T019 [P] [US3] `src/components/CharacterPick.tsx` + чиста функція вибору в `src/lib/characterPick.ts` з `src/lib/characterPick.test.ts`: 0 персонажів — «Спершу додай персонажа»; 1 — без питання; 2–3 — діалог, підказка — поточний; «Скасувати» — нічого не записано
- [ ] T020 [US3] `src/pages/Prices.tsx` і `src/components/ShotImport.tsx`: `character_id` з `CharacterPick` у кожній ручній ціні (імпорт знімка — один вибір на весь знімок); біля автора прибрати « #статік» (`Prices.tsx:147`)
- [ ] T021 [US3] `desktop/src/main.cjs`: `autoPrices`, `autoNextChange`, `autoUnknown` — `character_id: settings.character` у момент зчитування (`desktop/src/vision.cjs` → `onPrices`); відмова «Спершу вибери нік» — показати вікно входу

**Checkpoint**: quickstart рядки 6–7, 9.

---

## Phase 6: User Story 4 — Перехід без втрат (P2)

**Мета**: наявні статіки й ціни переходять на персонажів.
**Independent Test**: після міграції акаунт з профільним статіком має його в персонажа; старі ціни на місці.

- [ ] T022 [P] [US4] `src/lib/mapMarks.ts`, `src/pages/MapPage.tsx`: власник мітки — з нового `map_owners` (Ім'я_Прізвище персонажа за статіком), без змін формату даних
- [ ] T023 [US4] `specs/025-account-nick-characters/quickstart.md` — розділ «Перенесення»: SQL-запити перевірки після міграції (персонажі без статіку, ціни без `character_id`, акаунти без ніка) для SC-004

---

## Phase 7: Polish

- [ ] T024 Запис у `src/data/changelog.json`: новий запис з id дати релізу (якщо запис того дня вже в `main` — `РРРР-ММ-ДД.N`), групи added/changed — мовою гравця
- [ ] T025 Конституція `.specify/memory/constitution.md` — принцип V (PATCH, лише за згодою власника): «записи обліку, цін і чернеток програма лише додає; профіль і персонажів — керує власник» (plan.md, Complexity Tracking)
- [ ] T026 `npx.cmd tsc --noEmit`, `npx.cmd vitest run`, `cd desktop; npm.cmd test` — зелене; SQL-тест — у CI; ручні перевірки quickstart.md 1–9
- [ ] T027 Власнику: міграцію 0038 застосувати разом із випуском нової версії програми (до вибору ніка ціни не подаються — research R7)

## Dependencies & Execution Order

- Phase 1 → Phase 2 (база) → US1 → US2 → US3 → US4 → Polish
- US1 і US2 — обидві P1; подача цін після міграції вимагає ніка — тож у реліз ідуть разом
- US3 залежить від US2 (нік у зведеннях) і T005 (перевірка `character_id`); у реліз — разом з міграцією (див. Implementation Strategy)
- US4 — перевірка й мапа; перенесення даних уже в T007

## Parallel Opportunities

- Phase 2: T003–T007 — один файл міграції, послідовно; T002 (тест) — паралельно з ними
- US1: T008, T009, T010 — різні файли
- US2: T011, T012, T017 — паралельно; T013 → T014; T016 → T015 (шапка читає `nick` з `auth`)
- US3: T018, T019 — паралельно; T020 після T019

## Implementation Strategy

**Реліз — Phase 2 + US1 + US2 + US3 разом.** Після міграції (T005) база не приймає ціну без персонажа від акаунта з
2–3 персонажами — і з «зору», і вручну. Без T020–T021 такі гравці взагалі не подаватимуть ціни. Тому US3 входить у
той самий реліз, що й міграція.

Робити можна по черзі й перевіряти кожну історію окремо (локально, на гілці): US1 → US2 → US3. US4 (мапа й
SQL-перевірка перенесення) — у тому ж релізі або одразу після: дані переносить сама міграція (T007).
