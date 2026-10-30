---

description: "Задачі: один скупник «Шкури» замість «Шкури» й «М'ясо»"
---

# Tasks: Один скупник «Шкури» замість «Шкури» й «М'ясо»

**Input**: `/specs/003-merge-hide-meat-buyers/` — plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: обов'язкові за конституцією (VI): SQL-тест `supabase/tests/buyers_merge_test.sql` (перенесення, псевдонім,
права, повтор), `node --test` для `headerBuyer` у програмі.

**Що змінилось з часу плану (2026-10-27) — задачі вже це враховують:**

- Номер міграції — **`0040_merge_meat_into_hide.sql`**, не `0028` (0028–0039 зайняті; 0037 пропущено свідомо).
- **0029** `buyer_unknown_items` (FK на `buyers` з `on update cascade`, унікальний `(buyer_id, lower(text))`) — план
  про неї не знає: при видаленні `meat` її рядки зникли б каскадом. Переносити в `merge_buyer` зі злиттям дублів.
- **0030** `buyer_limit_reports` — FK на `buyer_items (buyer_id, item_id)` з `on update cascade`: переїде сама, коли
  оновиться `buyer_items.buyer_id`. Окремо не чіпати.
- **0038** переписала `set_next_change` (нік + персонаж зі статіком) і `check_buyer_report` (`character_id`). Нова
  `set_next_change` — **з тіла 0038** плюс псевдонім; `check_buyer_report` не чіпати (псевдонім підміняє `buyer_id`
  раніше, у тригері `price_reports_alias`, — за абеткою він перед `price_reports_check`).
- **Стара програма ціни м'яса не надішле, і база цього не виправить** (R3 помилився): у `desktop/src/vision.cjs`
  `scanPrices` бере товари `items.filter(i => i.buyer_id === buyer)` з каталогу сайту — після злиття для `meat` там
  0 товарів, тож до бази нічого не доходить. Псевдонім лишається для ручних запитів і `set_next_change`; стару
  програму лікує автооновлення (specs/006). Спеку US2.2 / FR-004 / SC-004 виправити — T012.
- `report_unknown_item` псевдонім **не** розв'язує навмисно: стара програма з 0 товарами `meat` вважала б невідомими
  всі 8 видів м'яса й засипала б адміну чергу «нових товарів» у «Шкурах». Нехай краще отримує «немає такого скупника».

## Phase 1: Setup

- [ ] T001 Перед міграцією — числа для SC-002 у Supabase → SQL Editor (квікстарт «Перед міграцією»), записати в `specs/003-merge-hide-meat-buyers/quickstart.md` під заголовком «Знімок до злиття»: `select buyer_id, count(*) from buyer_items where buyer_id in ('hide','meat') group by 1`, те саме для `price_history`, `price_reports`, `buyer_unknown_items`, `buyer_limit_reports`; без даних гравців — лише кількості

---

## Phase 2: Foundational (база — блокує всі історії)

**⚠️ CRITICAL**: усе — в одному файлі `supabase/migrations/0040_merge_meat_into_hide.sql`, послідовно; файл MUST
запускатися повторно без помилок і змін (FR-008). Заголовок-коментар: що й навіщо, specs/003.

- [X] T002 [P] SQL-тест `supabase/tests/buyers_merge_test.sql` (+ рядок `$P -f supabase/tests/buyers_merge_test.sql` наприкінці `supabase/tests/run.sh`; тестові id користувачів — новий діапазон, напр. `…0000000000e1`/`e2`, за зразком `supabase/tests/buyer_unknown_items_test.sql`): штучні скупники `t_from`/`t_to` з двома товарами (один спільний — R2), точками історії, повідомленням, рядком `buyer_unknown_items` (той самий текст в обох — злиття лічильників) і `buyer_limit_reports`; `select public.merge_buyer('t_from','t_to')` → `t_from` немає в `buyers`, усе в `t_to`, кількість точок історії до = після (нових не з'явилось), `price_at` товарів не змінився, `seen_count` дубля = сума; другий виклик — без помилок і змін; вставка `price_reports` з `buyer_id = 't_from'` від гравця з ніком і персонажем зі статіком → рядок з `buyer_id = 't_to'`; `set_next_change('t_from', …)` змінює таймер `t_to`; `report_unknown_item('t_from', …)` → помилка «немає такого скупника»; anon і user читають `buyer_aliases`, але `insert/update/delete` — відмова; `merge_buyer` від anon і authenticated — відмова (немає execute); у кінці: `meat` немає в `buyers` після накочених міграцій і сиду
- [X] T003 Таблиця `public.buyer_aliases (alias text primary key, buyer_id text not null references public.buyers on delete cascade)` — `create table if not exists`; RLS увімкнено, політика лише `for select using (true)`; `grant select … to anon, authenticated`; жодних insert/update/delete для клієнтів (data-model.md «Нове»)
- [X] T004 Тригер `price_reports_alias` — `before insert on public.price_reports`, функція `public.resolve_buyer_alias()` (`security definer set search_path = ''`): якщо `new.buyer_id` є в `buyer_aliases.alias` → `new.buyer_id := buyer_aliases.buyer_id`. Ім'я тригера MUST за абеткою йти перед `price_reports_check` (Postgres запускає тригери однієї події за абеткою). `drop trigger if exists` перед `create`
- [X] T005 `create or replace function public.set_next_change(p_buyer text, p_at timestamptz)` — **копія тіла з `supabase/migrations/0038_account_nick_characters.sql:118`** (перевірки ніка й персонажа зі статіком, вікно 24 год) + на початку `p_buyer := coalesce((select buyer_id from public.buyer_aliases where alias = p_buyer), p_buyer)`; права виконання — як у 0038
- [X] T006 `public.merge_buyer(p_from text, p_to text) returns void` (`security definer set search_path = ''`; якщо `p_from` немає в `buyers` — `return` без дій, FR-008): (1) `delete from buyer_items` рядків `p_from`, чий `item_id` уже є в `p_to` (R2); (2) `update buyer_items set buyer_id = p_to where buyer_id = p_from` — лише `buyer_id`, щоб тригери `buyer_items_price_log`/`buyer_items_price_stamp` не спрацювали (R1); `buyer_limit_reports` переїде сам (`on update cascade` з 0030); (3) `update price_history`, `update price_reports` — `buyer_id = p_to`; (4) `buyer_unknown_items`: спершу додати `seen_count` і пізніший `last_seen` до рядків `p_to` з тим самим `lower(text)` і видалити ці рядки `p_from`, потім решту — `buyer_id = p_to`; (5) таймер: у `p_to` — пізніший з двох `next_change_at` разом з його `next_change_by` (R4); (6) `insert into buyer_aliases values (p_from, p_to) on conflict (alias) do update set buyer_id = excluded.buyer_id`, і перенаправити старі псевдоніми, що вели на `p_from`; (7) `delete from buyers where id = p_from`. `revoke all on function … from public, anon, authenticated`
- [X] T007 Наприкінці міграції — `select public.merge_buyer('meat', 'hide');`

**Checkpoint**: `bash supabase/tests/run.sh` у CI — `buyers_merge_test.sql` зелений, решта тестів не впала.

---

## Phase 3: User Story 1 — Один скупник «Шкури» з шкурами й м'ясом (Priority: P1) 🎯 MVP

**Goal**: на сайті й у програмі «М'ясо» немає, його 8 товарів з цінами, позначками й історією — у «Шкурах».

**Independent Test**: анонімне вікно → «Ціни»: вкладки «М'ясо» немає, у «Шкурах» «М'ясо кабана» з тією ж ціною й
історією, що до злиття.

- [X] T008 [P] [US1] `supabase/seed/catalog_from_hub.sql`: прибрати рядок скупника `meat` з `buyers`, у `buyer_items` — `'meat'` → `'hide'` (9 входжень; без цього `on conflict (id) do update` відродить «М'ясо» при повторному сиді, R7); `items.sub = 'М''ясо'` не чіпати (R5)
- [X] T009 [P] [US1] `supabase/seed/history_from_hub.sql`: `'meat'` → `'hide'` (19 входжень); перевірити, що після заміни немає двох точок з тим самим `(buyer_id, item_id, at)`
- [X] T010 [US1] `public/snapshot/prices.json` — перезібрати `node scripts/snapshot.mjs` після застосування міграції (інакше статична копія без бази ще показує «М'ясо»); якщо скрипт потребує ключів, яких локально немає, — лишити збірці в `.github/workflows/deploy.yml` і записати це в T016 — **зроблено так**: `public/snapshot/` у `.gitignore`, копію збирає `npm run build` (`scripts/snapshot.mjs`) під час деплою; тож злиття в `main` — лише після міграції (T016)

**Checkpoint**: US1 перевіряється квікстартом п. 1–2 після T007.

---

## Phase 4: User Story 2 — Ціни м'яса з гри потрапляють до «Шкур» (Priority: P1)

**Goal**: ціни м'яса з сайту й нової програми — у «Шкурах»; підтвердження рахує повідомлення до й після злиття.

**Independent Test**: внести з сайту ціну «М'ясо оленя» у «Шкурах» — прийнято; нова програма у вікні скупника з м'ясом
пише в `vision.log` `prices hide: …`, не `prices meat`.

- [X] T011 [US2] `desktop/src/pricescan.cjs:150`: у `HEAD` — `[/м.?яс|мяс/, 'hide']` замість `'meat'` (FR-007); `desktop/src/pricescan.test.cjs:123` — `headerBuyer(L('Купуе', "м'ясо"))` → `'hide'`, додати `"мясо"` і `"м’ясо"` (contracts/desktop.md). Тести `coverage()` з `'meat'` (рядки 64, 131–133) перевіряють лік покриття для будь-якого чужого id — лишити, але в коментарі назвати `'meat'` умовним іншим скупником. Код з регулярками — лише через Edit, не скриптом (пам'ять: node-heredoc-backslash)
- [X] T012 [US2] Спека: `specs/003-merge-hide-meat-buyers/spec.md` US2.2, FR-004, SC-004 і `research.md` R3 — чесно: стара програма після злиття ціни м'яса **не надсилає** (0 товарів `meat` у каталозі), але й не ламається; ціни м'яса з програми — після автооновлення (specs/006). Псевдонім — для ручних запитів і таймера. Узгодити з власником перед зміною формулювань

**Checkpoint**: US2 — квікстарт п. 3 і 5; п. 4 («стара програма») перевіряє лише те, що в `vision.log` немає падінь.

---

## Phase 5: User Story 3 — Одна зміна цін для «Шкур» (Priority: P2)

**Goal**: у «Шкур» один таймер — пізніший з двох; зміна з сайту чи програми (і через `meat`) змінює його.

**Independent Test**: `select * from buyer_next_change` — один рядок `hide`, `next_change_at` — пізніший із «знімка до».

- [X] T013 [US3] Перевірити, що сайт і плашка програми не тримають власного таймера для `meat`: `grep -rn "meat" src desktop/src` (крім тестів і `src/data/mapIcons.ts` — там лише вибір іконки для категорій мапи, не скупник) — 0 входжень; знайдене — прибрати в тому ж файлі

---

## Phase 6: Polish

- [X] T014 Запис у `src/data/changelog.json` (зміна програми — `pricescan.cjs`): «fixed — «М'ясо» тепер у скупника «Шкури», як у грі». Перевірити, чи запис сьогоднішньої дати вже злитий у `main` (`git show origin/main:src/data/changelog.json`): злитий — новий запис з id `РРРР-ММ-ДД.N`, ні — доповнити наявний
- [X] T015 `npx.cmd tsc --noEmit`, `npx.cmd vitest run`, `cd desktop; npm.cmd test` — зелене; SQL-тести — `run.sh` у CI
- [ ] T016 Власнику, **порядок випуску** (plan.md «Structure Decision»): (1) T001 — знімок чисел; (2) вміст `0040_merge_meat_into_hide.sql` у Supabase → SQL Editor, **до** злиття в `main`; (3) запустити ще раз — без помилок (FR-008); (4) злити в `main` — сайт і програма з T011; (5) квікстарт п. 1–7 і зведений SQL «після» — кількості з T001: `hide` = `hide` + `meat` для кожної таблиці (SC-002); результат — у розділ «Реалізація» в `spec.md`

---

## Dependencies & Execution Order

- Phase 1 (T001) — до будь-якого запуску міграції на робочій базі (числа «до» потім не зібрати)
- Phase 2: T003 → T004 → T005 → T006 → T007 — один файл, послідовно; T002 (тест) — паралельно з ними
- US1 (T008–T010) — після Phase 2; T010 — лише після застосування міграції на робочій базі
- US2: T011 не залежить від бази (можна паралельно з Phase 2); T012 — після розмови з власником
- US3 (T013) — після T011
- Polish — останнім; T016 — власник

## Parallel Opportunities

- T002 ∥ T003–T007 (різні файли)
- T008 ∥ T009 ∥ T011 (різні файли)

## Implementation Strategy

**Реліз — одним заходом: Phase 2 + US1 + US2.** Після міграції `meat` зникає з каталогу; нова програма без T011
впізнавала б «м'ясо» як `meat` і, як і стара, нічого не надсилала б. Тому T011 MUST вийти в тому ж злитті, що й
міграція, а міграція — застосована **перед** злиттям (інакше нова програма шле в `hide` товари, яких у `hide` ще
немає, — `check_buyer_report` відмовить).

US3 фактично виконує T006 (таймер) — окрема задача T013 лише прибирає хвости.
