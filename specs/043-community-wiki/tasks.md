---

description: "Задачі 043 «Довідник від гравців»"
---

# Tasks: Гравці самі наповнюють і виправляють довідник

**Input**: `specs/043-community-wiki/` — plan.md, spec.md, research.md, data-model.md, contracts/wiki-rpc.md, quickstart.md

**Tests**: потрібні за конституцією (принцип VI): SQL-тест прав `supabase/tests/wiki_test.sql` і `vitest` для чистої логіки.

**Organization**: задачі за історіями. Перша черга — «Роботи» + «Транспорт» (FR-027); публікують `admin` і `moderator` (FR-008).
US5 (мітки мапи) і US6 (P3) — окремим релізом, «Предмети» — разом з 045.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можна паралельно (інший файл, без залежності від незакінчених задач)
- **[Story]**: US1…US6 зі spec.md

---

## Phase 1: Setup

- [x] T001 Перевірити вільний номер міграції: `ls supabase/migrations` (останній — 0056) і на базі — що 0055 і 0056 застосовані (`select to_regclass('public.discord_buyer_channels')`), пам'ять prod-migrations-gaps; номер нової — `0057`, інакше наступний вільний і поправити посилання в specs/043-community-wiki/data-model.md
- [x] T002 [P] Скрипт `scripts/jobs-seed.mjs`: читає `JOBS` з `src/data/jobs.ts` (через `npx.cmd tsx` або простий розбір масиву після `export const JOBS: Job[] =`), друкує SQL `insert into public.jobs (id, name, legal, level, profit, requirements, features, location, skills, progress, controls, tips, description, pay, forum) values … on conflict (id) do nothing;` і `insert into public.wiki_versions (section, target_id, version_no, data, kind) … on conflict do nothing` з `kind = 'seed'`, `version_no = 1`; рядки з `'` екрануються подвоєнням, масиви — `array[…]::text[]`, порожні — `'{}'`

---

## Phase 2: Foundational (блокує всі історії)

**Мета**: таблиці, права, функції публікації, роботи з бази, чиста логіка.

### Тести спершу

- [x] T003 [P] `supabase/tests/wiki_test.sql` (за зразком `supabase/tests/map_drafts_test.sql`, підключити в `supabase/tests/run.sh`): (а) `user` вставляє пропозицію `pending` — так; зі `status = 'accepted'` — ні; (б) `user` не бачить чужих пропозицій, `moderator` бачить усі; (в) `user` і `editor` викликають `wiki_decide` — помилка `QH010`; `moderator` і `admin` — так; (г) `user`, `editor`, `moderator` не можуть `update public.jobs` і `update public.vehicles` напряму, `admin` — може; (д) 11-та `pending` пропозиція при `max_pending = 10` — `QH002`; автор у `wiki_bans` — `QH001`; (е) поле поза білим списком (`vehicles.image_url`, `jobs.forum`) — `QH003`; (є) `accept` з `base_version` ≠ поточна — `QH013`, з `p_force` — так, а друга `pending` до тієї ж цілі стає `conflict`; (ж) `reject` без причини — `QH011`; (з) `wiki_revert` повертає знімок і додає версію `revert`, історія не зменшується; (и) `hidden = true` робота не видна `anon`, видна `moderator`; (і) bucket `wiki-proof`: чужий файл `user` не читає, автор і `moderator` читають
- [x] T004 [P] `src/lib/wiki.test.ts`: `FIELDS.job`/`FIELDS.vehicle` збігаються з білим списком contracts/wiki-rpc.md; `diff(old, next)` → лише змінені поля, масиви порівнюються за вмістом, `null` і `''` для чисел — «немає»; `similar('акванавт', list)` знаходить «Акванавт», «Водій автобуса» для «водій автобус», не знаходить для «пілот»; `slugFromName('Водій автобуса')` → `vodii-avtobusa` (лише `^[a-z0-9-]{2,40}$`); `validate('job', data)` — «Назва» обов'язкова 1–60, `level` 0–100, `profit` 0–3, пункт списку 1–400 і ≤ 30 пунктів, `description` ≤ 3000, `pay` ≤ 300

### Реалізація

- [x] T005 Міграція `supabase/migrations/0057_community_wiki.sql`, частина 1 — таблиці за data-model.md: `public.jobs` («`id` text PK `^[a-z0-9-]{2,40}$`», «`name` 1–60, унікальна без урахування регістру» — `unique index on lower(name)`, `legal` boolean, «`level` 0–100», «`profit` 0–3», масиви `text[]` «кожен пункт 1–400 символів, ≤ 30 пунктів» — immutable-функція перевірки як `news_items_ok` у 0055, «`description` ≤ 3000», «`pay` ≤ 300», `forum`, `hidden` default false, `version` default 1, `created_by`/`updated_by` → profiles `on delete set null`, `created_at`/`updated_at`); `alter table public.vehicles add column if not exists hidden boolean not null default false, version bigint not null default 1, created_by uuid references public.profiles on delete set null, updated_by uuid references public.profiles on delete set null, updated_at timestamptz`; `wiki_proposals` (усі поля й check-и з data-model.md: «`kind = 'new'` ⇔ `target_id is null`», «`status = 'rejected'` ⇒ `reason <> ''`», `section in ('job','vehicle')`, `source in ('game','discord','forum','own')`, «`source_note` ≤ 300», «`reason` ≤ 300», індекс `(status, created_at)` і `(section, target_id)`); `wiki_versions` (унікальний `(section, target_id, version_no)`); `wiki_settings` (один рядок `id boolean PK default true check (id)`, `max_pending 10`, `stale_days 30`, `proof_days 30`); `wiki_bans`; місце під P3 — `wiki_checks`, `wiki_notes` (лише таблиці й RLS «лише admin», без інтерфейсу)
- [x] T006 Міграція 0057, частина 2 — RLS: `jobs` select `hidden = false or my_role() in ('admin','moderator')`, запис `is_admin()`; `vehicles` — `drop policy "vehicles: staff write"` → `"vehicles: admin write"` з `is_admin()`, select `hidden = false or my_role() in ('admin','moderator')`; `wiki_proposals` select `author = auth.uid() or my_role() in ('admin','moderator')`, insert — `author = auth.uid() and status = 'pending'` для `authenticated`, update автора — лише `status: pending → withdrawn` і `seen_at` (через тригер-перевірку змінених полів), delete — нікому; `wiki_versions` select усім, запис — нікому (лише функції); `wiki_settings` select усім, update `is_admin()`; `wiki_bans` select `user_id = auth.uid() or my_role() in ('admin','moderator')`, запис `my_role() in ('admin','moderator')`; `revoke … from anon` для запису
- [x] T007 Міграція 0057, частина 3 — `wiki_clean(p_section text, p_data jsonb, p_new boolean) returns jsonb` (білий список полів з contracts/wiki-rpc.md, перевірка типів і меж, помилка `QH003` з назвою поля українською) і тригер `before insert` на `wiki_proposals`: `QH001` (заборона, текст з причиною), `QH002` (ліміт `max_pending`), `data := wiki_clean(...)`, `base_version` — поточна `version` цілі, якщо не задано
- [x] T008 Міграція 0057, частина 4 — `wiki_decide`, `wiki_revert`, `wiki_unhide`, `wiki_seen` точно за contracts/wiki-rpc.md (errcode `QH010`–`QH014`, `security definer`, `set search_path = ''`, `grant execute to authenticated`): застосування полів до `jobs`/`vehicles` (`version + 1`, `updated_by = author`, `updated_at = now()`; для `new` — `created_by`), запис `wiki_versions` з повним знімком (`to_jsonb(row)` лише білого списку + `hidden`), `pending` до тієї ж цілі → `conflict`, `decided_by`, `decided_at`, `version_id`; `accepted_edited`, коли `p_data` відрізняється від `data` пропозиції
- [x] T009 Міграція 0057, частина 5 — bucket `wiki-proof` (`insert into storage.buckets (id, name, public) values ('wiki-proof','wiki-proof', false) on conflict do nothing`) і політики `storage.objects`: insert/select/delete — `bucket_id = 'wiki-proof' and ((storage.foldername(name))[1] = auth.uid()::text or my_role() in ('admin','moderator'))`, insert — лише своя тека; view `wiki_contributors` (`id, name, avatar_url, accepted_edits, accepted_pages, rejected, last_at`), `grant select … to anon, authenticated`; вставка вихідних даних робіт і версій `seed` — вивід `node scripts/jobs-seed.mjs`; `vehicles` — версія `seed` 1 для кожного авто з поточних полів білого списку
- [x] T010 [P] `src/lib/wiki.ts` (щоб пройшов T004): `type Section = 'job' | 'vehicle'`, `FIELDS: Record<Section, Field[]>` (ключ, підпис українською, тип `text | longtext | list | int | bool | select`, обов'язковість, межі з data-model.md), `diff`, `similar`, `slugFromName` (транслітерація за КМУ 2010), `validate`, `SOURCES` («У грі», «Discord», «Форум QuantRP», «Власний досвід»), `REJECT_REASONS` (зокрема «Копія з іншого сайту», «Немає джерела», «Неправильні дані», «Дубль»), текст помилки з `errcode` `QH0xx` → як є з `message`
- [x] T011 `src/lib/jobsData.ts`: `useJobs()` — `jobs` з бази (`select *`, порядок за назвою) з запасом `JOBS` з `src/data/jobs.ts`, поки база не відповіла чи без `supabase`; `jobsMap()` для `src/lib/mapMarks.ts` (назва, `legal`, `level` з бази, якщо вже завантажено, інакше з `JOBS`); перевести `src/pages/Jobs.tsx`, `src/components/JobDialog.tsx`, `src/lib/mapMarks.ts` на нього без зміни вигляду. **Зроблено без `mapMarks.ts`**: мітки робіт на мапі (і в програмі) лишились на `src/data/jobs.ts` — підпис «з N рівня» оновиться в коді, щоб не міняти програму в першій черзі
- [x] T012 Прогнати `bash supabase/tests/run.sh` (T003 зелений), `npx.cmd vitest run`, `npx.cmd tsc --noEmit -p .`; `/wiki/roboty` показує ті самі роботи, що до переносу (quickstart, сценарій 1)

**Checkpoint**: роботи з бази, права й функції публікації працюють і покриті тестами.

---

## Phase 3: User Story 1 — «Знайшов помилку» (P1) 🎯 MVP

**Goal**: гравець пропонує правку картки роботи чи авто, модератор приймає чи відхиляє, гравець бачить статус.

**Independent Test**: quickstart, сценарії 2–5 (правка «Акванавта» → прийняти → картка змінилась, автор видно, у гравця «прийнято»).

- [x] T013 [P] [US1] `src/components/wiki/ProposeForm.tsx`: форма за `FIELDS[section]` з поточними значеннями картки; поле «Звідки знаєш» (`SOURCES`, обов'язкове) + «Посилання чи пояснення» (≤ 300); необов'язковий скрін — `PicUpload`-подібне завантаження в bucket `wiki-proof` за шляхом `<auth.uid()>/<proposal uuid>.webp` (uuid генерується на клієнті й іде в `id` пропозиції); нагадування «Лише з гри, Discord чи власного досвіду — не копіюй з інших сайтів» (FR-025); перевірка `validate` при blur і перед надсиланням; надсилає лише змінені поля (`diff`) з `base_version`; помилки `QH001`/`QH002`/`QH003` — текстом з бази; успіх — «Надіслано на розгляд. Статус — у кабінеті → «Мої правки»»
- [x] T014 [P] [US1] `src/components/wiki/DiffView.tsx`: «було → стало» поле за полем з підписами з `FIELDS`; списки — додані й прибрані пункти окремо; попередження «Картку змінили після цієї пропозиції», якщо `base_version` ≠ поточна (FR-010)
- [x] T015 [US1] Кнопка «Запропонувати правку» в `src/components/JobDialog.tsx` і в картці авто (`src/components/VehicleDialog.tsx` / `src/pages/Transport.tsx`): відкриває `ProposeForm`; для гостя — вхід через Discord з наміром у `sessionStorage` `qhub-wiki-intent` = `{ section, target_id }` і поверненням на ту саму адресу, після входу форма відкривається сама (FR-007, research R9; без сховища — без автовідкриття)
- [x] T016 [US1] `src/components/VehicleEdit.tsx`: `admin` — як зараз (прямий запис); `editor`/`moderator` — замість збереження надсилає пропозицію через `ProposeForm`-логіку (після T006 база не пускає їх напряму); підпис у формі «Зміни підуть на розгляд модератору»
- [x] T017 [US1] `src/components/admin/AdminWiki.tsx` + вкладка `['wiki', 'Довідник']` у `src/pages/Admin.tsx` (видна `admin` і `moderator`): список `wiki_proposals` зі `status in ('pending','conflict')`, найстаріші зверху, лічильник тих, що чекають, і вік найстарішої (FR-009); фільтри «Розділ» (роботи / транспорт) і «Статус»; відкрита пропозиція — автор, джерело, скрін (signed URL з `wiki-proof`), `DiffView` відносно поточної версії; «Прийняти» → `wiki_decide(accept)`; «Відхилити» з вибором `REJECT_REASONS` або своїм текстом (обов'язково, FR-011); `QH013` → «Прийняти поверх нової версії» (`p_force`); після рішення — видалити скрін зі сховища й очистити `proof_path`
- [x] T018 [US1] Кабінет → «Мої правки» (`src/pages/cabinet/`): свої пропозиції зі статусом («на розгляді / прийнято / прийнято з правками / відхилено — причина / конфлікт / відкликано»), кнопка «Відкликати» для `pending`; значок кількості рішень, яких автор ще не бачив (`decided_at is not null and seen_at is null`), біля «Кабінет» і вкладки; відкриття вкладки викликає `rpc('wiki_seen')` (FR-017, FR-018, research R6)
- [x] T019 [P] [US1] `src/components/wiki/PageMeta.tsx` у `JobDialog` і картці авто: «Додав <ім'я>», «Останнім оновив <ім'я> <дата>» (видалений акаунт — «гравець видалений»), позначка «Нове» / «Оновлено» протягом 7 днів після `created_at` / `updated_at` (FR-016)
- [ ] T020 [US1] Перевірити quickstart, сценарії 2–5 на робочій базі трьома акаунтами

**Checkpoint**: MVP — гравці виправляють картки, модератор публікує, без рішення нічого не змінюється.

---

## Phase 4: User Story 3 — Модерація: історія, правки модератора, відкат (P1)

**Goal**: модератор приймає з власними виправленнями, бачить історію картки, повертає будь-яку версію.

**Independent Test**: quickstart, сценарії 6–7 (дві правки → історія → відкат до версії 1 → картка як була, у історії «відкат»).

- [x] T021 [US3] `AdminWiki.tsx`: «Прийняти з правками» — форма з даними пропозиції, модератор змінює поля, `wiki_decide(accept, p_data)` → статус `accepted_edited`; у списку — і пропозиція автора, і варіант модератора (US3 AC2)
- [x] T022 [P] [US3] `src/components/wiki/HistoryDialog.tsx`: версії картки з `wiki_versions` (номер, вид — «початкова / правка / відкат / прибрано / повернуто», хто запропонував, хто прийняв, дата, нотатка), «було → стало» між сусідніми версіями через `DiffView`; кнопка «Повернути цю версію» з обов'язковою причиною — лише `admin`/`moderator` → `wiki_revert` (FR-012, US3 AC3–4); посилання «Історія» в `PageMeta`
- [x] T023 [US3] Заборона подавати пропозиції (FR-013): у `AdminWiki` біля автора — «Заборонити пропонувати» з причиною (`insert wiki_bans`) і «Зняти заборону»; у `ProposeForm` заблокований бачить пояснення з `wiki_bans.reason` замість форми
- [x] T024 [US3] Налаштування довідника в адмінці (лише `admin`): `max_pending`, `stale_days`, `proof_days` з `wiki_settings`; кнопка «Прибрати скріни старші <proof_days> днів» — видаляє файли з `wiki-proof` для вирішених пропозицій і чистить `proof_path` (FR-024, research R4)
- [ ] T025 [US3] Перевірити quickstart, сценарії 6–7, 10, 11

---

## Phase 5: User Story 2 — Додати нову сторінку (P1)

**Goal**: гравець пропонує нову роботу чи авто; після прийняття вона в списку, у пошуку й за адресою.

**Independent Test**: quickstart, сценарій 8.

- [ ] T026 [US2] Кнопка «Додати роботу» на `src/pages/Jobs.tsx` і «Додати транспорт» на `src/pages/Transport.tsx`: `ProposeForm` з порожніми полями, `kind = 'new'`; для роботи — `id` з `slugFromName(name)` (показується як адреса `/wiki/roboty?job=<id>`, можна змінити); обов'язкові поля підсвічені (US2 AC1)
- [ ] T027 [US2] Підказка дублів у `ProposeForm`: під полем «Назва» — «Можливо, це вже є: <назва>» з посиланням, за `similar()` по завантаженому списку розділу (FR-006, US2 AC2)
- [ ] T028 [US2] (частково: «Прибрати сторінку» в картці й «Повернути сторінку» в історії вже є — лишився список прибраних в адмінці) «Прибрати сторінку» (FR-015): у картці — `kind = 'hide'` з обов'язковою причиною в «Звідки знаєш»; у `AdminWiki` — `DiffView` показує «Сторінку буде сховано»; прибрані картки для `admin`/`moderator` у списку з позначкою «Прибрано» і кнопкою «Повернути» → `wiki_unhide`
- [x] T029 [US2] Нова робота без іконки `public/icons/jobs/<id>.svg` — показ загальної іконки `jobs` замість зламаної картинки (у `Jobs.tsx`, `JobDialog.tsx`, `mapMarks.ts`)
- [ ] T030 [US2] Перевірити quickstart, сценарій 8

---

## Phase 6: User Story 4 — Автори помітні (P2)

**Goal**: бали за правки в рейтингу, автори на картках, адмін бачить кандидатів у `editor`.

**Independent Test**: quickstart, сценарій 13.

- [ ] T031 [P] [US4] Рейтинг: вкладка «Довідник» поруч із рейтингом цін (сторінка, де зараз показується `contributors`): з `wiki_contributors` — прийняті правки й нові сторінки окремими числами, останнє рішення (FR-019, US4 AC1)
- [ ] T032 [US4] `src/components/admin/AdminAccounts.tsx`: для кожного гравця — прийняті / відхилені правки й частка прийнятих, сортування «За правками довідника»; зміна ролі — наявним керуванням ролями (FR-020, US4 AC3)
- [ ] T033 [US4] Перевірити quickstart, сценарій 13

---

## Phase 7: User Story 5 — Мітки на мапі від гравців (P2) — окремий реліз

- [ ] T034 [US5] Окрема специфікація-доповнення: розширити `map_drafts` (0019) на `user` з тією самою чергою `AdminWiki` і приватним скріном у `wiki-proof`; не починати до релізу Phase 3–6

## Phase 8: User Story 6 — «Актуально» й примітки (P3) — окремий реліз

- [ ] T035 [US6] «Актуально» (`wiki_checks`, один голос на версію, FR-021), «Може бути застарілим» після `stale_days` (FR-022), примітки (`wiki_notes`, FR-023) — після Phase 3–6, таблиці вже є з T005

---

## Phase 9: Polish

- [x] T036 [P] Пам'ять `.claude/memory/wiki-publish-via-rpc.md` + рядок у `.claude/memory/MEMORY.md`: довідник змінюється лише через `wiki_decide`/`wiki_revert`; новий розділ = `section` у check-ах, білий список у `wiki_clean` і `FIELDS`, RLS цілі `is_admin()`; роботи тепер у таблиці `jobs`, `src/data/jobs.ts` — лише запас
- [x] T037 [P] `src/data/sitenews.json` — запис мовою гравця: «Довідник тепер наповнюють гравці: «Запропонувати правку» в роботах і транспорті, статус — у кабінеті»; якщо змінилась поведінка мапи в програмі (T011, T029) — запис у `src/data/changelog.json`
- [ ] T038 `docs/PLAN.md`: 043 — зроблено (перша черга), далі 045 «Каталог предметів» з підключенням розділу `item`
- [ ] T039 Пройти весь `specs/043-community-wiki/quickstart.md` після застосування 0057 на базі (крок 2 — сліди міграції), `bash supabase/tests/run.sh`, `npx.cmd vitest run`, `npx.cmd tsc --noEmit -p .`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (T001–T002) → Foundational (T003–T012) → історії.
- US1 (Phase 3) — після Foundational; це MVP.
- US3 (Phase 4) — після US1 (використовує `AdminWiki`, `DiffView`).
- US2 (Phase 5) — після US1 (використовує `ProposeForm`, `AdminWiki`); незалежна від US3.
- US4 (Phase 6) — після US1 (потрібні прийняті пропозиції); незалежна від US2/US3.
- US5, US6 — окремі релізи.
- Polish — наприкінці.

### Within Each Story

- Тести бази (T003) і логіки (T004) — перед міграцією й `lib/wiki.ts`; міграція T005 → T006 → T007 → T008 → T009 (один файл, послідовно).

### Parallel Opportunities

- T002 ∥ T003 ∥ T004 (різні файли).
- T010 ∥ T005–T009 (сайт і SQL).
- US1: T013 ∥ T014 ∥ T019; потім T015–T018.
- US3: T022 ∥ T021.
- Після US1: US2 ∥ US3 ∥ US4.

## Parallel Example: User Story 1

```text
T013 ProposeForm.tsx   ∥   T014 DiffView.tsx   ∥   T019 PageMeta.tsx
→ T015 кнопки в картках → T016 VehicleEdit → T017 AdminWiki → T018 «Мої правки» → T020 перевірка
```

## Implementation Strategy

### MVP First

1. Phase 1–2: роботи з бази, права, функції — зелені тести.
2. Phase 3 (US1): правка → черга → рішення → статус у кабінеті.
3. **Зупинитись і перевірити** quickstart 2–5, застосувавши 0057 на базі; злити як перший реліз.

### Incremental Delivery

1. MVP (US1) → реліз.
2. US3 (історія, відкат, заборона) → реліз — до того, як довідник стане популярним (SC-005).
3. US2 (нові сторінки) → реліз.
4. US4 (рейтинг) → реліз.
5. US5, US6, «Предмети» (з 045) — окремими специфікаціями/релізами.

## Notes

- Міграцію на робочу базу застосовує власник вручну; SQL — у буфер з файлу (пам'ять discord-bot-ops), після — перевірка слідів (quickstart, крок 2).
- `vehicles` RLS звужується до `admin` у T006 — `editor` після релізу пропонує через чергу (plan → Complexity Tracking).
- Тексти інтерфейсу — українською, кнопки — дієсловом.
