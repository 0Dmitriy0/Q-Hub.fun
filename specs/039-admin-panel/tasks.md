# Tasks: Адмін-панель для розробників

**Input**: Design documents from `/specs/039-admin-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/admin-rpc.md, quickstart.md

**Tests**: SQL-тести прав обов'язкові (конституція VI, FR-002, SC-005, SC-006). Модульні тести — для чистої логіки (`src/lib/admin.ts`, `desktop/src/aliases.cjs`).

**Organization**: за історіями spec.md:
- US1 — черги;
- US2 — ролі;
- US3 — стан програми;
- US4 — знімки;
- US5 — переходи й налаштування.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можна паралельно (інші файли, без залежності від незавершених задач)
- **[Story]**: US1…US5

---

## Phase 1: Setup

- [ ] T001 Перевірити на робочій базі, що міграції 0043–0045 застосовані: є `price_rules`, `site_links` і view `price_pending` (пам'ять `prod-migrations-gaps`). Результат записати в `specs/039-admin-panel/quickstart.md` → «Підготовка».
- [ ] T002 Створити `supabase/migrations/0046_admin_panel.sql`. Шапка-коментар українською: що додає, «файл можна запускати повторно». Ідемпотентно: `if not exists`, `create or replace`, `drop … if exists`.
- [ ] T003 [P] Створити `supabase/tests/admin_panel_test.sql` за зразком `supabase/tests/site_links_test.sql`:
  - тестові акаунти `auth.users` → `profiles`: user, editor, moderator, два admin;
  - хелпер перемикання `set role` / `request.jwt.claim.sub`.

---

## Phase 2: Foundational (блокує всі історії)

- [ ] T004 Маршрут і доступ у `src/App.tsx`: `<Route path="admin" element={<Admin />} />` перед `admin/pravyla`. Сторінка — `src/pages/Admin.tsx`:
  - не `role === 'admin'` (зокрема гість і поки `useAuth().ready === false`) → рендерить `<NotFound />` (FR-001, research R1);
  - каркас — заголовок «Адмінка», вкладки «Черги / Гравці / Програма / Знімки / Налаштування» (`role="tablist"`, `aria-selected`);
  - вибрана вкладка — у `?tab=`.
- [ ] T005 [P] Посилання «Адмінка» в `src/components/Layout.tsx`: у шапці біля кнопки кабінету, лише коли `role === 'admin'` (FR-004).
- [ ] T006 [P] Спільний хелпер помилок `adminError(e)` у `src/lib/admin.ts`:
  - `42501` → «Немає прав — онови сторінку»;
  - `P0002` → «Цей рядок уже розібрано»;
  - `22023` → текст помилки бази;
  - інше → «Не вдалося — спробуй ще».

  Плюс компонент `src/components/admin/AdminSection.tsx`: заголовок, стан «вантажу», помилка з кнопкою «Спробувати ще» (FR-024).
- [ ] T007 [P] Стилі панелі в `src/styles.css`, блок `/* ---------- адмінка (specs/039) ---------- */`:
  - класи `.adm`, `.adm-tabs`, `.adm-row`, `.adm-badge`, `.adm-grid`, `.adm-shot`;
  - лише наявні змінні теми (`--surface`, `--line2`, `--accent`…), обидві теми;
  - ≥1280 px зручно, на телефоні без горизонтальної прокрутки сторінки (FR-025).

**Checkpoint**: `/admin` відкривається адміну порожніми вкладками, усім іншим — «Не знайдено».

---

## Phase 3: User Story 1 — Розібрати черги від програми (P1) 🎯 MVP

**Goal**: усі черги видно й розбирати їх можна в панелі.

**Independent Test**: quickstart, сценарії 2–4.

### Tests (US1)

- [ ] T008 [P] [US1] Додати в `supabase/tests/admin_panel_test.sql` блок черг:
  - user, editor, moderator і anon отримують `42501` на `admin_queue_counts`, `admin_unknown_resolve`, `admin_limit_resolve`, `admin_price_pending`, `admin_price_reject`;
  - admin:
    - `add` створює `items` + `buyer_items` і видаляє рядок;
    - `alias` дописує текст у `items.aliases` без дублів (повтор у іншому регістрі не дублює);
    - `drop` лише видаляє;
    - повторна дія над тим самим `id` → `P0002`;
    - `fix` з `min >= max` → `22023`;
    - `admin_price_reject` видаляє лише голоси за цю ціну, новіші за `price_at`.

### Implementation (US1)

- [ ] T009 [US1] У `0046_admin_panel.sql` — `admin_queue_counts()` → `json {unknown, limits, pending, drafts}`:
  - `drafts` = `map_drafts where status = 'new'`;
  - `pending` = кількість рядків `price_pending`.

  Шаблон для всіх `admin_*`: `security definer set search_path = ''`, перший рядок `if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'; end if;`, `revoke all … from public, anon; grant execute … to authenticated`.
- [ ] T010 [US1] У `0046_admin_panel.sql` — `admin_unknown_resolve(p_id bigint, p_action text, p_item bigint default null, p_name text default null, p_category text default null)`:
  - починає з `delete from public.buyer_unknown_items where id = p_id returning buyer_id, text`; немає рядка → `P0002`;
  - `add`: або наявний `p_item`, або новий `items(name = trim(p_name), category = p_category)` — назва унікальна; вже є така → `22023 'Такий товар уже є: …'`. Потім `insert into buyer_items (buyer_id, item_id) … on conflict do nothing`;
  - `alias`: `p_item` обов'язковий; `update items set aliases = array_append(aliases, text)`, якщо `lower(text)` ще немає серед `lower(name)` / `lower(aliases)`. Обмеження з data-model: «кожен 4–80 символів»;
  - `drop`: нічого більше;
  - невідомий `p_action` → `22023`.
- [ ] T011 [US1] У `0046_admin_panel.sql` — `admin_limit_resolve(p_buyer text, p_item bigint, p_action text, p_min bigint default null, p_max bigint default null)`:
  - `delete from buyer_limit_reports … returning`; немає рядка → `P0002`;
  - `fix` вимагає `0 < p_min < p_max`, інакше `22023`; оновлює `buyer_items.min_price/max_price`.
- [ ] T012 [US1] У `0046_admin_panel.sql` — `admin_price_pending()` → `setof (buyer_id, item_id, item, price, votes, need, last_at, reporters text[])`:
  - як view `price_pending` з 0043 (голоси новіші за `buyer_items.price_at`, у вікні `price_rules.confirm_window`, ціна ≠ поточної);
  - плюс `array_agg(distinct coalesce(profiles.nick, profiles.name))` авторів.

  `admin_price_reject(p_buyer, p_item, p_price) returns int`: видаляє `price_reports` (`kind = 'buyer'`, ця ціна, `created_at > price_at`); 0 рядків → `P0002`.
- [ ] T013 [US1] Компонент `src/components/admin/AdminQueues.tsx` (FR-005…FR-010):
  - чотири блоки з лічильниками з `admin_queue_counts`, загальне число вгорі `Admin.tsx`;
  - **невідомі товари** (`buyer_unknown_items` з `buyers(name)`, сортування `seen_count desc, last_seen desc`): рядок «текст · скупник · бачили N разів · коли». Кнопки:
    - «Додати товар» — форма: назва, категорія з `categories` (типово найчастіша серед товарів цього скупника) або вибір наявного товару;
    - «Це вже є…» — вибір товару цього скупника, з пошуком;
    - «Відкинути»;
  - **поза межами** (`buyer_limit_reports` з `items(name)` і поточними межами з `buyer_items`): «Поправити межі» — форма min/max, заповнена поточними; «Відкинути»;
  - **непідтверджені ціни** (`admin_price_pending`):
    - «Підтвердити» — вставка в `price_reports` (`kind: 'buyer'`, `source: 'site'`, `reporter: uid`), так само як «Внести ціну» в `src/pages/Prices.tsx`;
    - «Відкинути» — `admin_price_reject`;
  - **чернетки**: «N нових чернеток» → `Link` на `/mapa` у режимі розбору (як відкриває `MapDrafts` — перевірити параметр у `src/pages/MapPage.tsx`);
  - після кожної дії рядок зникає. На `P0002` — повідомлення й перезавантаження блоку;
  - усі черги порожні → «Черги порожні — нічого розбирати».
- [ ] T014 [P] [US1] Програма: чиста функція `expandAliases(rows)` у `desktop/src/aliases.cjs` і тест `desktop/src/aliases.test.cjs`:
  - для кожного `{…, items: {name, aliases}}` додає копії з `items.name = alias`;
  - порожні й дублікати без регістру — пропускає;
  - оригінал лишається першим.
- [ ] T015 [US1] `desktop/src/main.cjs` (~рядок 1004, вибірка для зору): `items(name)` → `items(name,aliases)` і результат через `expandAliases` (research R3). Перевірити, що `id` товару в копії той самий: так ціна пишеться в правильний товар.

**Checkpoint**: US1 працює окремо — MVP.

---

## Phase 4: User Story 2 — Призначати ролі (P1)

**Goal**: пошук акаунта й зміна ролі без Supabase.

**Independent Test**: quickstart, сценарій 5.

### Tests (US2)

- [ ] T016 [P] [US2] У `supabase/tests/admin_panel_test.sql`:
  - `admin_find_accounts`: від anon, user, editor, moderator → `42501`; `q` з 1 символу → `22023`; результат ≤ 20;
  - у відповіді немає ключів `start_balance`, `goal`, `goal_name` (SC-006);
  - `admin_set_role`:
    - admin видає `editor` → `profiles.role = 'editor'`;
    - зняти `admin` із себе → `22023`;
    - лишився один admin, а другий намагається зняти його → `22023`;
    - невідома роль → `22023`;
    - прямий `update profiles set role` від authenticated як і раніше заборонений.

### Implementation (US2)

- [ ] T017 [US2] У `0046_admin_panel.sql` — `admin_find_accounts(q text)`:
  - `char_length(trim(q)) >= 2`, інакше `22023`;
  - `nick ilike '%'||q||'%' or name ilike …`, `limit 20`;
  - повертає `id, nick, name, avatar_url, role, created_at, last_seen (app_presence.seen_at), version (app_presence.version), characters json`, де `characters` = `json_agg(json_build_object('name', c.name, 'static_id', c.static_id) order by c.created_at)`. Лише ці поля (FR-003).
- [ ] T018 [US2] У `0046_admin_panel.sql` — `admin_set_role(p_user uuid, p_role text) returns text`:
  - `p_role in ('user','editor','moderator','admin')`, інакше `22023`;
  - `p_user = auth.uid()` і `p_role <> 'admin'` → `22023 'Свою роль admin зняти не можна'`;
  - `perform 1 from profiles where role = 'admin' for update`; якщо ціль — admin, нова роль не admin і `count(admin) = 1` → `22023 'Це останній admin — спершу признач іншого'`;
  - немає профілю → `22023 'Немає такого акаунта'`.
- [ ] T019 [US2] Компонент `src/components/admin/AdminAccounts.tsx` (FR-011…FR-014):
  - поле пошуку з затримкою 300 мс від 2 символів;
  - картки: аватар, нік, ім'я Discord, роль-бейдж, «з <дата>», «у програмі: <коли> · v<версія>», персонажі «Ім'я_Прізвище #статік»;
  - вибір ролі `select` → підтвердження «Видати <нік> роль <роль>?» → `admin_set_role` → оновити картку;
  - без збігів — «Нікого не знайдено за "<запит>"».

**Checkpoint**: US1 і US2 працюють незалежно.

---

## Phase 5: User Story 3 — Стан програми (P2)

**Goal**: онлайн, версії, ШІ, завантаження.

**Independent Test**: quickstart, сценарій 6.

### Tests (US3)

- [ ] T020 [P] [US3] У `supabase/tests/admin_panel_test.sql`:
  - `app_ping()` без аргументу й `app_ping('0.6.3')` від authenticated працюють і пишуть `version` (`null` / `'0.6.3'`);
  - `app_ping('abc')` пише `null`;
  - `admin_app_stats()`: від не-admin → `42501`; від admin — `online_3m`, `online_24h`, `versions`, `ai`, `downloads`.
- [ ] T021 [P] [US3] `src/lib/admin.test.ts` (vitest):
  - `compareVersions` («0.5.110» > «0.5.99», `null` — у кінці);
  - `releaseVersion(assets)` з `[{name: 'Q-Hub-Setup-0.5.110.exe'}, {name: 'latest.yml'}]` → `'0.5.110'`, без збігу → `null`.

### Implementation (US3)

- [ ] T022 [US3] У `0046_admin_panel.sql`:
  - `alter table public.app_presence add column if not exists version text, add column if not exists first_seen timestamptz not null default now()`;
  - `drop function if exists public.app_ping()`, потім `create function public.app_ping(p_version text default null)`:
    - upsert свого рядка;
    - `version = case when p_version ~ '^\d+\.\d+\.\d+$' then p_version end`. Обмеження з data-model: «`null` або `^\d+\.\d+\.\d+$`»;
    - grant як у 0023;
  - `admin_app_stats() returns json`:
    - `online_3m`, `online_24h`;
    - `versions` за 7 днів: `[{version, n}]`;
    - `ai`: `requests` = сума `n`, `users`, `capped` = `n >= 150` за `(now() at time zone 'Europe/Kyiv')::date`, `limit` 150;
    - `downloads`: `n`, `since` з `site_counters`.

  SQL з `\d` вставляти через Edit/Write, а не node-шаблоном (пам'ять `node-heredoc-backslash`).
- [ ] T023 [P] [US3] `src/lib/admin.ts`: `compareVersions(a, b)`, `releaseVersion(assets)` (регулярка `^Q-Hub-Setup-(\d+\.\d+\.\d+)\.exe$`), `fetchLatestRelease()` — `fetch('https://api.github.com/repos/0Dmitriy0/Q-Hub.fun/releases/tags/desktop-latest')`, помилка → `null`.
- [ ] T024 [US3] Компонент `src/components/admin/AdminAppState.tsx` (FR-016):
  - плитки «Зараз у програмі», «За добу», «ШІ сьогодні: N запитів · M гравців · K у ліміті», «Завантажень: N з <дата>»;
  - таблиця версій, новіша перша; `null` — «стара версія (до цієї функції)»; поруч з версією, що дорівнює `releaseVersion`, — бейдж «остання в релізі»;
  - частка акаунтів на останній версії (SC-004).
- [ ] T025 [US3] `desktop/src/main.cjs` (~рядок 890): `sb.rpc('app_ping', { p_version: app.getVersion() })`.
- [ ] T026 [US3] `src/data/changelog.json`: новий запис з id сьогоднішньої дати релізу. Якщо запис цього дня вже в `main` — `РРРР-ММ-ДД.N`. Групи:
  - `changed`: «Програма повідомляє свою версію, щоб розробники бачили, чи дійшло оновлення»;
  - `fixed`: «Товари, які у вікні скупника читалися з помилкою, після перевірки розробниками впізнаються як потрібні».

  Лише про програму (пам'ять `changelog-program-only`).

**Checkpoint**: US3 працює. Без нової збірки програми всі акаунти показано як «стара версія».

---

## Phase 6: User Story 4 — Навчальні знімки (P2)

**Goal**: переглядати й видаляти знімки Alt+S.

**Independent Test**: quickstart, сценарій 7.

### Tests (US4)

- [ ] T027 [P] [US4] У `supabase/tests/admin_panel_test.sql`:
  - `admin_training_shots` від не-admin → `42501`;
  - від admin повертає лише `.jpg` з `bucket_id = 'training'`, новіші першими, `nick` автора;
  - `p_limit` поза 1–100 → `22023`.

  У `run.sh` імітація `storage.objects` уже є: вставити тестові рядки.
- [ ] T028 [P] [US4] `src/lib/admin.test.ts`:
  - `shotMeta(name)` з `'<uid>/1730570000000.jpg'` → `{ owner, json: '<uid>/1730570000000.json' }`;
  - `isOldShot(createdAt, now)` — понад 90 днів → `true`.

### Implementation (US4)

- [ ] T029 [US4] У `0046_admin_panel.sql` — `admin_training_shots(p_before timestamptz default null, p_limit int default 50)`:
  - `select o.name, o.created_at, split_part(o.name, '/', 1)::uuid as owner, coalesce(p.nick, p.name) as nick from storage.objects o left join public.profiles p on p.id::text = split_part(o.name, '/', 1)`;
  - `where bucket_id = 'training' and name like '%.jpg' and (p_before is null or created_at < p_before)`;
  - `order by created_at desc limit p_limit`.
- [ ] T030 [P] [US4] `src/lib/admin.ts`: `shotMeta(name)`, `isOldShot(createdAt, now = Date.now())` (90 днів, FR-019).
- [ ] T031 [US4] Компонент `src/components/admin/AdminShots.tsx` (FR-017…FR-020):
  - порція 50 через `admin_training_shots`; мініатюри через `supabase.storage.from('training').createSignedUrls(names, 600)`; мітки — паралельне `download` `.json` поруч (`{label, note, version}`);
  - сітка мініатюр: мітка, нотатка, нік, дата, бейдж «старий» (FR-019);
  - фільтр за міткою по завантаженому; «Показати ще» — `p_before` = остання дата;
  - клік → перегляд на весь екран (`dialog`, Esc закриває, ←/→ — сусідні);
  - вибір кількох → «Видалити вибрані» з підтвердженням → `storage.remove([jpg, json])`;
  - файл зник → «файл видалено» і кнопка прибрати.

**Checkpoint**: US4 працює окремо.

---

## Phase 7: User Story 5 — Переходи й налаштування (P3)

**Goal**: один вхід до наявних інструментів; Discord і промо — прямо в панелі.

**Independent Test**: quickstart, сценарій 8.

- [ ] T032 [P] [US5] Винести `DiscordForm` з `src/pages/Download.tsx` в `src/components/DiscordForm.tsx` (експорт). У `Download.tsx` — імпорт, поведінка та сама.
- [ ] T033 [P] [US5] Винести `PromoForm` з `src/components/SitePromo.tsx` в `src/components/PromoForm.tsx` (експорт). У `SitePromo.tsx` — імпорт, поведінка та сама.
- [ ] T034 [US5] Компонент `src/components/admin/AdminLinks.tsx` (FR-021, FR-022):
  - плитки-переходи: «Правила» → `/admin/pravyla`, «Мапа — чернетки» → `/mapa` (режим розбору, як у T013), «Інструкція до мапи» → `/mapa/v-gru`, «Івенти й промокоди» → `/#iventy`;
  - нижче — `DiscordForm` (поточне з `useDiscord`) і `PromoForm` (поточний `site_promo`, перемикач «увімкнено»).

---

## Phase 8: Polish

- [ ] T035 [P] Підключити всі розділи в `src/pages/Admin.tsx`: вкладки → `AdminQueues`, `AdminAccounts`, `AdminAppState`, `AdminShots`, `AdminLinks`. Кожен у `AdminSection` (незалежні помилки, FR-024). Сторінка — `lazy` у `src/App.tsx`, як інші сторінки після злиття `site-pagespeed`.
- [ ] T036 [P] Тексти панелі — українською, кнопки дієсловами (FR-023): пройтися по `src/components/admin/*.tsx`.
- [ ] T037 Перевірки:
  - `npx.cmd tsc --noEmit`, `npx.cmd vitest run`, `cd desktop && npm.cmd test` — усе зелене;
  - `supabase/tests/run.sh` — у CI (`deploy.yml`) або на машині з Postgres.
- [ ] T038 Власнику: застосувати `0046_admin_panel.sql` на робочій базі після T001. Пройти quickstart 1–9.
- [ ] T039 `docs/PLAN.md`: позначити specs/039 у «Що лишилось» / етапі 4; зсунути беклог Majestic на 040+. `specs/039-admin-panel/spec.md` Status → Implemented після T038.

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → **Foundational (T004–T007)** → історії.
- **US1 (T008–T015)** і **US2 (T016–T019)** — незалежні, обидві P1. MVP = US1.
- **US3 (T020–T026)**: T025 (програма) і T022 (база) незалежні; статистика версій має сенс після релізу з T025.
- **US4 (T027–T031)** незалежна.
- **US5 (T032–T034)** незалежна.
- Усі SQL-задачі пишуть в один файл `0046_admin_panel.sql`, тож вони послідовні між собою: T009 → T010 → T011 → T012 → T017 → T018 → T022 → T029.
- **Polish (T035–T039)** — після потрібних історій.

## Parallel Examples

- **US1**: T014 (програма, `aliases.cjs`) паралельно з T009–T012 (SQL) і T008 (тест).
- **US3**: T021 + T023 (`src/lib/admin.ts`) паралельно з T022 (SQL) і T025 (програма).
- **US5**: T032 і T033 паралельно.

## Implementation Strategy

1. **MVP:** Setup + Foundational + US1 → застосувати 0046 частково (черги) → розбирати черги з сайту.
2. Далі US2 (ролі) — найбільший біль після черг.
3. US3 разом із наступним релізом програми (версія в `app_ping`).
4. US4, US5 — зручність; можна однією гілкою.
