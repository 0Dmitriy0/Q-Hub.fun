# Tasks: Скупник риби — фіксовані ціни й нові види риби

**Input**: Design documents from `/specs/096-fish-fixed-prices/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/fixed-prices.md, quickstart.md

**Tests**: потрібні. Конституція VI вимагає тести на права й логіку. Spec SC-002 і SC-005 — це перевірки тестами.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Перевірити на базі передумови 0082 (пам'ять `prod-migrations-gaps`):
  - чи є стовпці `buyers.next_change_at` (0009) і `buyer_items.price/price_at`;
  - чи є функції `check_buyer_report` (0054), `report_limit_mismatch` (0054) і `set_next_change` (0009);
  - як заповнено `items.image_url` у 14 наявних риб (`select name, image_url from items where category = 'fish'`);
  - чи немає вже в `items` назв «Короп», «Щука», «Сом», «Лосось», «Мурена», «Осетр».

  SQL дати власнику через буфер, результат записати в `specs/096-fish-fixed-prices/research.md` (R6, R7).

## Phase 2: Foundational (блокує всі історії)

- [X] T002 Створити `supabase/migrations/0082_fixed_price_buyers.sql`, частина «схема»:
  - `alter table public.buyers add column if not exists fixed_prices boolean not null default false`;
  - `sale_limit numeric` з `check (sale_limit is null or sale_limit > 0)`;
  - `sale_limit_unit text` з `check (sale_limit_unit is null or sale_limit_unit in ('кг','шт'))`;
  - тригер `before update` на `buyers`: коли `fixed_prices` стає true → `next_change_at := null, next_change_by := null`.

  RLS: змінювати `fixed_prices`, `sale_limit` і `sale_limit_unit` може лише staff. Звірити з наявною політикою `update` на `buyers`; якщо її немає — політика `using (public.is_staff())`.
- [X] T003 У тій самій міграції `set_next_change`: скопіювати поточне тіло й додати перевірку. Якщо `fixed_prices` скупника = true → `raise exception 'У цього скупника фіксовані ціни — час зміни не потрібен.'`.
- [X] T004 У тій самій міграції `check_buyer_report`: скопіювати поточне тіло з 0054 і на початку додати перевірку. Якщо скупник `fixed_prices` і внесення не ручне від staff (ту саму умову «ручне внесення staff», що вже є в функції) → `raise exception 'У цього скупника фіксовані ціни — їх оновлює адміністрація.'`.
- [X] T005 У тій самій міграції `report_limit_mismatch`: скопіювати тіло з 0054. Для фіксованого скупника приймати `p_price <> buyer_items.price` без вимоги «поза межами», а решту правил (ліміти, дедуп) залишити.
- [X] T006 У тій самій міграції, частина «дані»:
  - вставити 6 `items` (`category 'res'`, `sub 'Риба'`, `unit 'кг'`, `image_url` у форматі з T001): Короп/carp, Щука/pike, Сом/catfish, Лосось/salmon, Мурена/moray, Осетр/sturgeon. `on conflict (name) do nothing`, далі брати `id` за назвою (R7);
  - `insert buyer_items ('fish', id)` для шести;
  - `update buyer_items set price = …, price_at = '2026-11-24 00:25+02'` для всіх 20 за таблицею зі spec.md «Контекст» (тригер історії пише точки);
  - `update buyers set fixed_prices = true, sale_limit = 5000, sale_limit_unit = 'кг' where id = 'fish'`.

  Файл має бути повторно запусковим.
- [X] T007 SQL-тест `supabase/tests/fixed_prices_test.sql` за зразком `supabase/tests/team_test.sql`. Сценарії:
  - гравець не може `update buyers set fixed_prices`;
  - гравець не може `set_next_change('fish', …)`;
  - `insert price_reports` гравця для `fish` → помилка «фіксовані ціни»;
  - staff ставить ціну → `buyer_items.price` змінено;
  - `report_limit_mismatch` з іншою ціною додає рядок;
  - звичайний скупник поводиться як раніше.

**Checkpoint**: міграція й тест готові. Власник застосовує 0082, і після цього ціни на сайті одразу правильні навіть до змін інтерфейсу.

## Phase 3: User Story 1 — гравець бачить 20 риб з фіксованими цінами (P1) 🎯 MVP

**Goal**: сайт і пошук Alt+Q показують «фіксована ціна», ліміт, без таймера, меж і «нова: … з N».
**Independent Test**: quickstart сценарії 1–2.

- [X] T008 [US1] `src/pages/Prices.tsx` і `src/lib/usePrices.ts`: читати `buyers.fixed_prices, sale_limit, sale_limit_unit`. Для фіксованого скупника:
  - сховати блок «Наступна зміна цін» і кнопку вписування часу (рядки ~262–268);
  - сховати межі (`noLim`/`limFor`) і позначки `price_pending`;
  - сховати кнопку голосу гравця;
  - показати бейдж «фіксована ціна» біля ціни й рядок «Ліміт продажу: 5000 кг» у шапці скупника.
- [X] T009 [P] [US1] Тест `src/pages/Prices.fixed.test.ts` (vitest, без `node:fs` — пам'ять `tests-no-node-fs`): для фіксованого скупника функції показу повертають «без таймера, без меж, з бейджем». Винести чисту функцію `buyerView(buyer)` у `src/lib/usePrices.ts`, якщо її ще немає.
- [X] T010 [US1] Програма, пошук Alt+Q: у `desktop/src/main.cjs` (завантаження цін, ~рядок 889) додати `buyers(fixed_prices)` у select і поле `fixed` у рядок. У `src/desktop/barParts.tsx` (~рядок 127) для `fixed` замість «межі …» показати «фіксована ціна».

**Checkpoint**: US1 перевіряється на сайті після 0082 без змін у програмі.

## Phase 4: User Story 2 — програма не просить сканувати рибу даремно (P1)

**Goal**: 20 назв розпізнано, цін не надіслано, підказки «прокрути» немає, розбіжність іде адміну.
**Independent Test**: quickstart сценарії 4–5.

- [X] T011 [US2] `desktop/src/main.cjs` `visionCatalog()` (~рядок 1337): select `buyer_items(..., buyers(fixed_prices))`, у рядок каталогу додати `fixed: !!r.buyers?.fixed_prices`.
- [X] T012 [US2] `desktop/src/pricescan.cjs` `pricePicker` для `r.fixed`, за contracts/fixed-prices.md:
  - `price === last` → додати в `ok` (покриття), у `out` нічого;
  - інакше впевнена зчитка (`score ≥ ODD_SURE`) `ODD_TIMES` разів → один елемент `odd`, у `out` нічого;
  - межі й `jump` до фіксованого не застосовувати.
- [X] T013 [US2] `desktop/src/pricescan.cjs` (стан покриття, `frame()`/`coverage`): для скупника, усі рядки каталогу якого `fixed`, повертати `shown: false`, щоб `onCoverage` у `desktop/src/main.cjs` (~рядок 704) не показував «прокрути список». У `autoNextChange` (`desktop/src/main.cjs` ~1428) не викликати RPC для фіксованого скупника.
- [X] T014 [P] [US2] Тести в `desktop/src/pricescan.test.cjs`:
  - фіксований скупник з ціною = last → `out` порожній, товар у `confirmed`;
  - інша ціна з `score 0.97` тричі → рівно один `odd` і порожній `out`;
  - покриття фіксованого скупника → `shown === false`;
  - звичайний скупник поводиться без змін.
- [X] T015 [P] [US2] Фікстура `desktop/src/fixtures/prices/fish-2026-11-24.json` з OCR-рядків трьох знімків (`%APPDATA%\Q-Hub\shots\2026-11-24_00-25-*.png`) і тест у `desktop/src/pricescan.test.cjs`: каталог із 20 фіксованих риб → 20 з 20 зіставлено, `out` порожній (SC-002). Зразок — наявна `desktop/src/fixtures/prices/fish-full.json`.

**Checkpoint**: тести програми зелені, `vision.log` наживо не містить надісланих цін риби.

## Phase 5: User Story 3 — адмін керує фіксованими цінами (P2)

**Goal**: staff вмикає/вимикає режим, змінює ліміт і ціни; розбіжності видно в «перевір межі».
**Independent Test**: spec US3, сценарії 1–3.

- [X] T016 [US3] `src/pages/Prices.tsx`, блок staff скупника: перемикач «Фіксовані ціни» і поля «Ліміт продажу» (число + `кг`/`шт`) → `supabase.from('buyers').update(...)`. Для фіксованого скупника лишити наявну кнопку «Оновити ціну» для staff.
- [X] T017 [US3] `src/pages/Prices.tsx`, блок «перевір межі» (`limRep`/`limFor`, ~рядки 110–118): для фіксованого скупника показувати рядок `buyer_limit_reports` як «На екрані інша ціна: X $ (зараз Y $) — перевір фіксовану» з кнопками «Оновити ціну» і «Прибрати». Розширювати межі (`widen`) не пропонувати.

## Phase 6: User Story 4 — іконки шести нових риб (P2)

**Goal**: у 20 з 20 риб є іконка в стилі наявних.
**Independent Test**: сторінка скупника риби без рядків без іконки, світла й темна теми.

- [X] T018 [P] [US4] Намалювати `public/icons/fish/carp.svg`, `pike.svg`, `catfish.svg`, `salmon.svg`, `moray.svg`, `sturgeon.svg` за зразком `public/icons/fish/perch.svg`:
  - `viewBox 0 0 512 512`;
  - тінь `ellipse cx 256 cy 452`;
  - вертикальний градієнт тіла з `id` з префіксом назви;
  - плавці й око;
  - розмір файлу в межах наявних (≤ 4 КБ).

  Кожна риба — впізнавана: короп золотавий, щука видовжена плямиста, сом з вусами, лосось сріблясто-рожевий, мурена змієподібна, осетр з кістковими щитками.
- [X] T019 [P] [US4] `public/icons/fish/map.json`: додати 6 назв → файли.

## Phase 7: User Story 5 — ліміт продажу (P3)

- [X] T020 [US5] Переконатися, що рядок «Ліміт продажу: {sale_limit} {sale_limit_unit}» із T008 показується для будь-якого скупника із заданим `sale_limit`, а не лише для фіксованих, і ховається, коли значення `null`. Покрити випадком у `src/pages/Prices.fixed.test.ts`.

## Phase 8: Polish

- [X] T021 `src/data/changelog.json`: у верхній запис із `"pending": true` дописати мовою гравця:
  - added: «Скупник риби: 6 нових видів — Короп, Щука, Сом, Лосось, Мурена, Осетр»;
  - changed: «Скупник риби: ціни фіксовані за кг — програма більше не просить прокручувати його список і не надсилає ціни риби».
- [X] T022 Прогнати `npx.cmd vitest run` і `cd desktop && node --test --test-force-exit src/*.test.cjs`. Зібрати програму й перезапустити з коду (пам'ять `relaunch-app-after-change`), зняти знімок сторінки скупника риби й смужки через порт 9333 (пам'ять `self-verify-before-handoff`).
- [ ] T023 Розділ 096 на столі: результат, кнопки «SQL 0082 у буфер», «0082 застосовано → перевір наживо», коміт і PR.

## Dependencies & Execution Order

- T001 → T002–T006 (одна міграція, послідовно) → T007.
- Застосування 0082 власником → перевірка US1 і US3 наживо.
- US1 (T008–T010) і US2 (T011–T015) незалежні між собою. Обидва залежать лише від схеми з T002.
- US3 (T016–T017) після T008 (той самий файл `Prices.tsx`).
- US4 (T018–T019) незалежна, можна будь-коли.
- US5 (T020) після T008.
- Polish — останнім.

## Parallel Example

```text
Одночасно: T009 (тест сайту), T014 (тести pricescan), T015 (фікстура), T018 + T019 (іконки)
```

## Implementation Strategy

1. **MVP**: Phase 1–2 + US1. Після 0082 гравці одразу бачать правильні 20 цін, бо дані в базі. Інтерфейс лише прибирає таймер і межі.
2. US2 — у пак програми, разом з іншими 13 змінами.
3. US3, US4, US5 — тим самим PR. Іконки можна робити паралельно.
