# Tasks: Заробіток персонажа за годину в кабінеті

**Input**: Design documents from `specs/044-cabinet-hourly-earnings/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/session-money.md, contracts/cabinet-earnings.md, quickstart.md

**Tests**: обов'язкові за конституцією, принцип VI — SQL-тест на кожну зміну прав, модульні тести на чисту логіку (сайт — `vitest`, програма — `node --test`).

**Organization**: задачі згруповано за історіями користувачів (US1–US3) зі spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можна робити паралельно (інші файли, немає залежностей від незавершених задач)
- **[Story]**: US1 / US2 / US3

---

## Phase 1: Setup — ⛔ блокує все інше

**Purpose**: зняти порушення принципу V (plan.md → Complexity Tracking). Без явного «так» власника задачі нижче **не починати**.

- [X] T001 Отримати від власника згоду на принцип V 1.2.0 (погоджено 2026-11-03) і оновити `.specify/memory/constitution.md`: принцип V — «Облік програма не веде. Зберігає лише підсумок сеансу персонажа: баланс на початку й наприкінці, суму зростань і час першого й останнього зчитування; бачить і видаляє його лише власник»; версія 1.1.1 → 1.2.0, `Last Amended` — дата згоди, рядок у Sync Impact Report (MINOR, specs/044)
- [X] T002 Перевірити на робочій базі, що 0043–0048 застосовані (пам'ять prod-migrations-gaps): `game_sessions.external_id` і `unique (character_id, external_id)` існують, `price_rules` є — інакше спершу докотити пропущене

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: схема бази й накопичення грошей у програмі — потрібні всім історіям.

**⚠️ CRITICAL**: жодна історія не починається до завершення цієї фази.

### Тести (спершу, мають падати)

- [X] T003 [P] SQL-тест прав у `supabase/tests/session_money_test.sql`: власник вставляє й оновлює свій рядок `game_sessions` з `money_*` і читає його; інший `user`, `anon` і `admin` не бачать і не змінюють чужий; `money_rules` читає `anon`, оновлює лише `admin` (`user` — помилка); check-обмеження відхиляють `money_to < money_from`, від'ємні `money_start`/`money_end`/`money_gain` і частково заповнені `money_*`; додати файл до `supabase/tests/run.sh`, якщо скрипт не підхоплює тести сам
- [X] T004 [P] Тести накопичення в `desktop/src/sessionmoney.test.cjs` за таблицею з `contracts/session-money.md`: +100 000, −30 000, +50 000 → gain 150 000, start/end дають net 120 000; стрибок +9 000 000 при `max_jump` 5 000 000 → `flag = true`, gain без змін, `last` = нове значення; падіння понад поріг → теж `flag`; новий ключ (сеанс або персонаж) → відлік заново; `summary()` до першого зчитування → `null`; стан переживає `sessionMoney(saved)`; наявні тести `perHour()` лишаються зеленими

### Реалізація

- [X] T005 Міграція `supabase/migrations/0049_session_money.sql` (ідемпотентна, `if not exists`, `drop policy if exists`): у `public.game_sessions` додати nullable `money_from timestamptz`, `money_to timestamptz`, `money_start bigint`, `money_end bigint`, `money_gain bigint` і `money_flag boolean not null default false`; check `money_to >= money_from`, `money_start >= 0`, `money_end >= 0`, `money_gain >= 0`, «усі п'ять полів `money_from…money_gain` або разом null, або разом заповнені»; таблиця `public.money_rules` (`id boolean primary key default true check (id)`, `max_jump bigint not null default 5000000 check (max_jump between 100000 and 1000000000)`, `min_minutes int not null default 5 check (min_minutes between 1 and 120)`), вставка одного рядка, RLS: select — `anon` і `authenticated`, update — `is_admin()`; політику «сесії персонажа» не чіпати
- [X] T006 Розширити `desktop/src/sessionmoney.cjs`: стан `{ key, start, startAt, last, lastAt, gain, flag }`; `update(key, money, at, maxJump)` за правилами з `contracts/session-money.md`; новий `summary(key)` → `{ money_from, money_to, money_start, money_end, money_gain, money_flag }` або `null`; `perHour()` без змін; оновити коментар угорі (більше не «нічого не пишеться в базу»)

**Checkpoint**: T003–T004 зелені; схема і накопичення готові.

---

## Phase 3: User Story 1 — Середнє за годину за весь час (Priority: P1) 🎯 MVP

**Goal**: програма пише підсумок кожного сеансу, а кабінет показує зіграний час, «Заробив» і «Чистими» та $/год за весь час для обраного персонажа.

**Independent Test**: зіграти два сеанси одним персонажем (1 год +100 000 $ і 2 год +50 000 $) → `/kabinet/zarobitok` показує 3 год, 150 000 $, 50 000 $/год; інший персонаж — свої цифри; без сеансів — «Ще немає даних».

### Тести

- [X] T007 [P] [US1] Тести таймера в `desktop/src/session.test.cjs`: старт сеансу передає згенерований `external_id`; кожен beat і фінальний запис передають `money()` (якщо не `null`); два записи з тим самим `external_id` — upsert одного рядка; фінальний запис з помилкою → підсумок у черзі, наступний tick зі зв'язком відправляє його й очищує чергу; черга > 200 → найстаріші відкидаються; сеанс < `MIN_SESSION` → `drop`, як зараз; персонаж змінився посеред сеансу → `money()` для старого рядка більше не передається
- [X] T008 [P] [US1] Тести розрахунку в `src/lib/earnings.test.ts`: «весь час» = Σ`money_gain` ÷ Σ(`money_to − money_from`) і Σ(`money_end − money_start`) ÷ Σчасу; сеанси з `money_flag` і коротші за `minMinutes` не входять у середнє й рахуються в `skipped`; порожній список → `perHourGain = perHourNet = null`; від'ємне «Чистими» лишається від'ємним

### Реалізація

- [X] T009 [US1] Оновити `tracker` у `desktop/src/session.cjs`: генерувати `external_id` (`randomUUID`) на старті; `deps.db.start/beat` → upsert повного рядка (`character_id, external_id, started_at, ended_at` + `deps.money()`); стан `settings.session` містить `external_id` і `character`; при невдалому фінальному записі класти підсумок у `deps.queue`, на кожному tick відправляти чергу (ліміт 200); старий збережений стан без `external_id` — завершити, як раніше, без грошей
- [X] T010 [US1] Підключити в `desktop/src/main.cjs`: `db.start/beat` через `sb.from('game_sessions').upsert(row, { onConflict: 'character_id,external_id' })`; `money: () => sessMoney?.summary(moneyKey())` лише якщо персонаж сеансу = `settings.character`; черга в `settings.sessionQueue`; читати `money_rules` на старті й раз на годину (без зв'язку — збережені, за замовчуванням 5 000 000 і 5) і передавати `maxJump` в `onMoney → update`; оновити коментар над `sessMoney` (specs/044 замість «у базу нічого не пишеться»)
- [X] T011 [P] [US1] Чиста функція в `src/lib/earnings.ts`: типи `SessionRow`, `Day` (`{ day, ms, gain, net, perHourGain, perHourNet, skipped }`) і `summarize(rows, { from?, to?, minMinutes })` → `{ total, days, best }` за `contracts/cabinet-earnings.md` (для US1 достатньо `total`)
- [X] T012 [US1] Сторінка `src/pages/cabinet/Earnings.tsx`: один запит `game_sessions` (`started_at, money_from, money_to, money_start, money_end, money_gain, money_flag`, `character_id` = обраний, `money_from is not null`, сортування за `started_at`) + `money_rules.min_minutes`; блок «Весь час»: «Зіграно з програмою N год M хв», «Заробив X $ · Y $/год» (головне), «Чистими Z $ · W $/год» (від'ємне — червоним); стани з `contracts/cabinet-earnings.md`: немає персонажа, «Ще немає даних — запусти гру з програмою Q-Hub» + посилання на завантаження, помилка мережі
- [X] T013 [US1] Маршрут `zarobitok` і вкладка «Заробіток» між «Документи» і «Налаштування» в `TABS` у `src/pages/cabinet/Cabinet.tsx` (опис «За годину й по днях», наявна іконка)
- [X] T014 [P] [US1] Чесний текст у `src/desktop/Settings.tsx` (FR-017): «Звідки програма бере прибуток за годину» — програма читає готівку й картку з HUD; наприкінці кожного сеансу зберігає лише підсумок (баланс на початку й наприкінці, суму надходжень і час) — його видно лише тобі в кабінеті на сайті, вкладка «Заробіток»; окремих операцій не записує

**Checkpoint**: US1 працює сама: зіграний сеанс з'являється в кабінеті ≤ 1 хв після виходу з гри.

---

## Phase 4: User Story 2 — Дні й пошук за датами (Priority: P1)

**Goal**: проміжок дат, рядок на кожен день із сеансами, підсумок проміжку, найкращий день.

**Independent Test**: сеанси в 3 різні дні, обрати проміжок з двома з них → два рядки з правильними сумами, підсумок = їх сума; «Весь час» збігається з US1.

### Тести

- [X] T015 [P] [US2] Доповнити `src/lib/earnings.test.ts`: сеанс з `started_at` 23:30 за Києвом, що триває до 01:30, — у дні початку; перехід на зимовий/літній час не зсуває день; фільтр `from/to` включно за київськими датами; дні без сеансів відсутні; середнє проміжку = Σ/Σ, а не середнє з денних; `best` — день з найбільшим `perHourGain` (`null`, якщо днів немає); дні новіші зверху

### Реалізація

- [X] T016 [US2] Додати в `src/lib/earnings.ts` групування за днями (`Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' })`), фільтр проміжку, `days` і `best`
- [X] T017 [US2] В `src/pages/cabinet/Earnings.tsx`: кнопки «Сьогодні / Тиждень / Місяць / Весь час» і поля «від — до» (з підписами, за замовчуванням «Тиждень» — останні 7 днів включно з сьогодні); підсумок проміжку тими самими трьома числами; таблиця днів (дата, час, «Заробив», «$/год», «Чистими») з позначкою «Найкращий»; «За ці дні сеансів немає», якщо днів немає; примітка під таблицею й «Не враховано N сеансів…» з `contracts/cabinet-earnings.md`
- [X] T018 [US2] Розгорнути день → сеанси дня (час, «Заробив», «Чистими», позначка «сумнівне зчитування») з кнопкою «Прибрати» в `src/pages/cabinet/Earnings.tsx` (FR-016): підтвердження з назвою сеансу (дата й час), `delete` з `game_sessions` за `id` (RLS дозволяє лише своє), після — перерахунок без перезавантаження

**Checkpoint**: US1 і US2 працюють разом; цифри «Весь час» у блоці і в проміжку «Весь час» збігаються.

---

## Phase 5: User Story 3 — Графік по днях (Priority: P3)

**Goal**: стовпчиковий графік «Заробив $/год» по днях обраного проміжку.

**Independent Test**: тиждень із сеансами в 4 дні → 4 стовпчики з тими самими значеннями, що в таблиці.

- [X] T019 [US3] Графік у `src/pages/cabinet/Earnings.tsx` над таблицею: стовпчики `perHourGain` з `days` (без нової бібліотеки — SVG або CSS, як решта сайту), підпис значення при наведенні й фокусі, кольори з наявних токенів теми (світла й темна), `aria-label` з підсумком для читачів екрана; дні без даних не малюються

**Checkpoint**: усі історії працюють незалежно.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T020 [P] Поле порогів у вкладці адмінки «Налаштування» в `src/pages/Admin.tsx` (+ `src/lib/admin.ts`, якщо там живуть запити): «Сумнівний стрибок балансу, $» (`max_jump`) і «Мінімальна тривалість сеансу, хв» (`min_minutes`) з підписами й межами з `data-model.md`; запис — `update money_rules` (RLS: лише `admin`)
- [X] T021 [P] Запис у `src/data/changelog.json`: новий id — дата релізу (якщо того дня запис ще не вийшов у `main` — доповнити його), `"version": "0.7.0"`; added: «Кабінет на сайті — вкладка „Заробіток“: скільки заробляє персонаж за годину за весь час і по днях»; changed: «Програма зберігає підсумок сеансу — баланс на початку й наприкінці. Окремих операцій не записує, бачиш лише ти»
- [X] T022 [P] Версія програми `desktop/package.json`: `0.6.0` → `0.7.0` (останню цифру ставить збірка, `desktop/scripts/version.mjs`)
- [X] T023 [P] `docs/PLAN.md`: у «Що лишилось» — 044 і що міграцію 0049 треба застосувати на базі; у Карті сайту кабінет — «Дашборд · Документи · Заробіток · Налаштування»; рядок «Програма для всіх» — підсумок сеансу в кабінеті (specs/044)
- [X] T024 Прогнати всі тести: `npm.cmd test` (vitest), `cd desktop && npm.cmd test` (node --test), `bash supabase/tests/run.sh` — усе зелене
- [X] T025 (закрито рішенням власника 2026-11-03: без інтернету гра не працює, тож офлайн-сценарій у грі неможливий; підсумки в кабінеті перевіряються на першому сеансі після виходу 0.7.0) Ручна перевірка за `specs/044-cabinet-hourly-earnings/quickstart.md` (сеанс з грошима, офлайн-сеанс без дубля, інший акаунт не бачить, смужка Alt+Q як раніше, у `transactions` / `deals` нових рядків немає)
- [X] T026 Застосувати `0049_session_money.sql` на робочій базі (вручну) і переконатися, що старі версії програми (0.6.x) далі пишуть сеанси без помилок (нові колонки nullable)

---

## Dependencies & Execution Order

- **Phase 1 (T001–T002)** блокує все. T001 — рішення власника, без нього фаза 2 не починається.
- **Phase 2 (T003–T006)**: T005 після T003 (тест спершу), T006 після T004. T003 і T004 — паралельно.
- **US1 (T007–T014)** — після фази 2. Програма (T007 → T009 → T010) і сайт (T008 → T011 → T012 → T013) — дві незалежні гілки; T014 — будь-коли.
- **US2 (T015–T018)** — після T011 і T012 (розширює ту саму функцію й сторінку). Без US1 неможлива: сторінка й дані з'являються там.
- **US3 (T019)** — після T016 (потрібні `days`).
- **Polish** — T020–T023 паралельно після фази 2; T024–T026 — останніми.

## Parallel Example: User Story 1

```text
# одночасно, після фази 2:
T007  desktop/src/session.test.cjs        (тести таймера)
T008  src/lib/earnings.test.ts            (тести розрахунку)
T014  src/desktop/Settings.tsx            (текст)
# далі дві незалежні гілки:
програма: T009 session.cjs → T010 main.cjs
сайт:     T011 earnings.ts → T012 Earnings.tsx → T013 Cabinet.tsx
```

## Implementation Strategy

1. **MVP = Phase 1 + Phase 2 + US1** — програма пише підсумки, кабінет показує середнє за весь час. Уже можна злити й випустити 0.7.0: дані почнуть накопичуватися з першого дня, навіть якщо дні ще не показуються.
2. **+ US2** — дні й проміжок дат (друга половина запиту власника). Можна в тому ж релізі, якщо готово одночасно.
3. **+ US3 і адмінка порогів** — окремо, без нового релізу програми (лише сайт).

Ранній випуск програми важливий: старі сеанси грошей не мають, тож кожен день до 0.7.0 — день без даних у кабінеті.
