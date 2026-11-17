---

description: "Task list: Статистика активності й сповіщення переможцям"
---

# Tasks: Статистика активності й сповіщення переможцям

**Input**: `specs/091-activity-stats/` — plan.md, spec.md, research.md, data-model.md, contracts/rpc.md, contracts/discord-dm.md, contracts/ui.md, quickstart.md

**Tests**: обов'язкові за конституцією (принцип VI). SQL-тести прав і правил зарахування; звірка `activity_events` з джерелами (SC-001); vitest на текст для Discord, CSV, шаблон і DM.

**Organization**: US1 + US2 (P1) — MVP для щомісячного оголошення. US3 (виключення) і US6 (налаштування) доповнюють підрахунок. US4 (сповіщення на сайті) має власну міграцію 0076. US5 (DM) спирається на US4.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Закомітити `specs/091-activity-stats/` у гілку `091-activity-stats` (вже створена від `origin/main`, без upstream на `main`)
- [X] T002 Перевірити на проді публічним ключем, що застосовані 0061 і 0065: `map_point_authors?select=point_id&limit=1` і `wiki_guides?select=id&limit=1` без помилки. Якщо помилка — зупинитись і сказати власнику, яку міграцію накотити перед 0075 (пам'ять проєкту: `prod-migrations-gaps.md`)
- [X] T003 [P] `supabase/tests/run.sh`: у блок імітації Supabase після `create table auth.users …` додати `create table auth.identities (user_id uuid references auth.users(id) on delete cascade, provider text not null, provider_id text not null);` і `grant select on auth.identities to postgres;` — потрібна для `notification_dm_batch` (research R9)

---

## Phase 2: Foundational (блокує всі історії)

- [X] T004 Міграція `supabase/migrations/0075_activity_stats.sql`, частина «події». Таблиця `public.activity_events` за data-model.md:
  - `id bigint generated always as identity primary key`;
  - `user_id uuid not null references public.profiles(id) on delete cascade`;
  - `category text not null check (category in ('prices','marks','guides'))`;
  - `entity_id text` (null, поки не опубліковано);
  - `created_at timestamptz not null`;
  - `status text not null check (status in ('pending','counted','rejected','removed'))`;
  - `source text not null check (source in ('price_reports','map_drafts','wiki_proposals'))`, `source_id text not null`, `unique (source, source_id)`;
  - `group_key text` (для `prices` — `buyer_id||'|'||item_id`, інакше null);
  - `updated_at timestamptz not null default now()`.

  Індекси: `(category, created_at)`, `(user_id, category, created_at)`, `(category, entity_id)`. `enable row level security`; політика `select using (public.is_admin())`; жодних політик на запис; `revoke all … from anon, authenticated; grant select … to authenticated`. Файл ідемпотентний (`if not exists`, `drop policy if exists`, `create or replace`)
- [X] T005 У `0075`: функція `public.activity_event_state(p_source text, p_source_id text) returns table(user_id uuid, category text, entity_id text, created_at timestamptz, status text, group_key text)` (`stable security definer set search_path = ''`) — єдине місце правил з research R4:
  - `price_reports` з `kind = 'buyer'` → `prices`, `counted`, `entity_id = id`, `created_at` звіту; рядка немає → `removed`;
  - `map_drafts` → `marks`: `new` → `pending`; `rejected` → `rejected`; `published` з `point_id`, якщо мітка існує, `not hidden` і `(batch_id is null or public.map_batch_published(batch_id))` → `counted`, інакше `removed`; `entity_id = point_id::text`;
  - `wiki_proposals` з `kind = 'new'`: section `map_point` → `marks`, `guide` → `guides`. `pending` → `pending`; `rejected/withdrawn/conflict` → `rejected`; `accepted/accepted_edited` → `entity_id` з `wiki_versions` (`version_id`) `target_id`, і перевірка видимості (мітка — як вище; гайд — рядок `wiki_guides` існує й `not hidden`) → `counted`, інакше `removed`;
  - інші section і kind → нуль рядків (подія не створюється)
- [X] T006 У `0075`: `public.activity_upsert(p_source text, p_source_id text)` — upsert з `activity_event_state` за `(source, source_id)`, `updated_at = now()`. Якщо джерела немає, а подія є — `status = 'removed'`. Тригери `after insert or update or delete … for each row` (`security definer`, `set search_path = ''`):
  - `price_reports` (лише `kind = 'buyer'`);
  - `map_drafts` (зміна `status` / `point_id`);
  - `wiki_proposals` (зміна `status` / `version_id`; section `map_point`/`guide`; kind `new`);
  - `map_points` (update `hidden`/`batch_id`, delete) → `activity_upsert` для всіх подій `category = 'marks' and entity_id = id::text`;
  - `map_batches` (update) → для подій міток цієї партії;
  - `wiki_guides` (update `hidden`, delete) → для подій `guides` з цим `entity_id`
- [X] T007 У `0075`: `public.activity_sync_all() returns int` — проходить усі рядки трьох джерел (з фільтрами T005) і всі наявні події, викликає `activity_upsert` і повертає кількість змінених подій. Наприкінці міграції — `select public.activity_sync_all();` (разове перенесення наявних даних)
- [X] T008 У `0075`: таблиця `public.activity_settings`:
  - `id boolean primary key default true check (id)`;
  - `price_daily_limit int not null default 1 check (price_daily_limit between 1 and 50)`;
  - `excluded_roles text[] not null default '{admin,moderator}' check (excluded_roles <@ array['user','editor','moderator','admin'])`;
  - `updated_by uuid references public.profiles(id) on delete set null`, `updated_at timestamptz not null default now()`;
  - `insert … values (true) on conflict do nothing`.

  RLS: `select using (public.is_admin())`, без політик на запис
- [X] T009 [P] SQL-тест `supabase/tests/activity_stats_test.sql` (стиль `supabase/tests/map_point_authors_test.sql`, свої uuid `…0091a1`…`…0091a9`). Сценарії подій:
  - звіт ціни → `counted`; виправлення в тому ж циклі — та сама подія; delete → `removed`;
  - чернетка `new` → `pending` → `published` → `counted`; мітку `hidden` → `removed`; unhide → `counted`; мітка в неопублікованій партії → `removed`;
  - пропозиція `guide`/`new` `pending` → `accepted` → `counted`; `kind = 'edit'` → подій немає; гайд `hidden` → `removed`;
  - `rejected` → `rejected`.

  Після кожного сценарію: `select public.activity_sync_all() = 0` (звірка, SC-001). anon і `user` не читають `activity_events` (0 рядків). Додати `$P -f supabase/tests/activity_stats_test.sql` у `supabase/tests/run.sh` після wiki-тестів і `map_point_authors_test.sql`
- [X] T010 [P] `src/lib/activityStats.ts`: типи `Category = 'prices' | 'marks' | 'guides'`, `CATEGORY_LABEL` (`Ціни скупників`, `Мітки на мапі`, `Гайди`), `TopRow { category, place, userId, nick: string | null, cnt, reachedAt }`, `Period { from: string; to: string }` (YYYY-MM-DD); `currentMonth(now)`, `previousMonth(now)` за `Europe/Kyiv`; `periodLabel(p)`: повний місяць → «листопад 2026», інакше «5–12 листопада 2026» (research R8); `validPeriod(p)`: `from <= to` і ≤ 366 днів

**Checkpoint**: `bash supabase/tests/run.sh` зелений; події відповідають джерелам.

---

## Phase 3: User Story 1 — Топ гравців за період (P1) 🎯 MVP

**Goal**: адмін бачить топ-10 у трьох категоріях за обраний період.

**Independent Test**: тестові внески кількох гравців → `activity_top` за місяць збігається з ручним підрахунком; модератор отримує `42501`.

- [X] T011 [US1] У `0075`: `public.activity_top(p_from date, p_to date, p_limit int default 10) returns table(category text, place int, user_id uuid, nick text, cnt int, reached_at timestamptz)` (`stable security definer set search_path = ''`), за contracts/rpc.md:
  - перший рядок: `if not public.is_admin() then raise exception 'лише для адміна' using errcode = '42501'`; `p_from > p_to` або `p_to - p_from > 365` → `22023`;
  - межі: `created_at >= (p_from::timestamp at time zone 'Europe/Kyiv')` і `< ((p_to + 1)::timestamp at time zone 'Europe/Kyiv')`;
  - лише `status = 'counted'`; роль автора (`profiles.role`) не в `activity_settings.excluded_roles`;
  - для `prices`: `row_number() over (partition by user_id, group_key, (created_at at time zone 'Europe/Kyiv')::date order by created_at) <= price_daily_limit`;
  - `cnt = count(*)`, `reached_at = max(created_at)`; ранжування `cnt desc, reached_at asc, user_id`; `nick = nullif(btrim(profiles.nick), '')`.

  Таблиці виключень ще немає: залишити CTE `excluded` з `where false`, щоб T024 лише замінив його. `revoke execute … from public, anon; grant execute … to authenticated`
- [X] T012 [P] [US1] Доповнити `supabase/tests/activity_stats_test.sql`:
  - anon, `user`, `editor`, `moderator` → `42501` на `activity_top`, `admin` → рядки (SC-004);
  - ліміт цін: 3 звіти одного товару одного скупника за київську добу → 1; два різні товари → 2; звіт о 23:59 за Києвом 31.10 → у жовтні;
  - нічия за кількістю → вище той, у кого `reached_at` раніше;
  - внески `admin` і `moderator` не рахуються (типові налаштування), `editor` — рахуються;
  - `p_from > p_to` → `22023`
- [X] T013 [P] [US1] `src/lib/activityStats.test.ts` (vitest): `currentMonth`/`previousMonth` на межі місяця за Києвом (`2026-10-31T22:30Z` → листопад), січень → грудень попереднього року; `periodLabel` для повного місяця й довільного проміжку; `validPeriod` для 367 днів → false
- [X] T014 [US1] `src/components/admin/AdminStats.tsx` за contracts/ui.md:
  - вибір періоду: «Цей місяць» (типово) / «Попередній місяць» / «з–по» + «Застосувати»; невалідний період — кнопка недоступна з поясненням;
  - `supabase.rpc('activity_top', { p_from, p_to })`; три картки за `CATEGORY_LABEL` з рядками `місце · нік (або «без ніку») · кількість`; порожньо — «За цей період внесків немає»;
  - стан завантаження (скелет картки); помилка — повідомлення з кнопкою «Спробувати ще»;
  - стилі в наявному файлі стилів адмінки з префіксом `adm-stats-`
- [X] T015 [US1] `src/pages/Admin.tsx`: додати `'stats'` у тип `Tab`; у групу «Люди» — `['stats', 'Статистика активності', 'chart']` (якщо іконки `chart` немає в наборі іконок адмінки — додати поруч з наявними); `views.stats = <AdminStats />`. Вкладка лише для `mode === 'admin'` (модератора й редактора не пускає, як і решту адмін-вкладок)

**Checkpoint**: MVP-підрахунок працює на сайті з базою (`npx.cmd vite --mode production`).

---

## Phase 4: User Story 2 — Текст для Discord і CSV (P1)

**Goal**: готове оголошення з топ-3 і CSV за період.

**Independent Test**: вставити текст у тестовий канал Discord без правок; CSV відкривається в Excel з кирилицею й колонками.

- [X] T016 [P] [US2] `src/lib/activityStats.ts`:
  - `escapeDiscord(s)`: `\` перед `* _ ~ \` | > # [ ] \`, після кожного `@` — U+200B;
  - `discordAnnouncement(rows: TopRow[], period: Period): string[]`: заголовок `🏆 Активність на Q-Hub — <periodLabel>`; для кожної категорії `**<назва>**` і до 3 рядків `🥇/🥈/🥉 <escapeDiscord(nick ?? 'без ніку')> — <cnt>`; менше 3 гравців — стільки, скільки є; нікого — `— немає учасників`. Частини ≤ 2000 символів, розрив лише між категоріями;
  - `toCsv(rows)`: `'﻿'` + заголовок `Категорія;Місце;Нік;Кількість`, роздільник `;`, кожне поле в `"…"` з подвоєнням лапок, рядки через `\r\n`
- [X] T017 [P] [US2] `src/lib/activityStats.test.ts`: нік `a_b*c` → `a\_b\*c`; `@everyone` у ніку → без пінгу (є U+200B); 1 і 0 гравців у категорії; 3 категорії × 3 рядки з ніками по 32 символи — одна частина; штучно довгий вхід → кілька частин, кожна ≤ 2000 і не рве категорію; CSV починається з BOM, `;`, лапки в ніку подвоєні
- [X] T018 [US2] `src/components/admin/AdminStats.tsx`:
  - кнопка «Скопіювати для Discord»: одна частина → `navigator.clipboard.writeText` і статус «Скопійовано» (`role="status"`); кілька → список частин з окремими «Скопіювати частину N» і попередженням про ліміт 2000 символів;
  - кнопка «Експорт CSV» → `Blob` `text/csv;charset=utf-8`, файл `q-hub-aktyvnist-<from>_<to>.csv`

**Checkpoint**: US1 + US2 — достатньо для щомісячного оголошення. Можна випускати окремим PR.

---

## Phase 5: User Story 3 — Внески гравця й виключення (P2)

**Goal**: адмін бачить внески гравця й виключає внесок або гравця з причиною; підрахунок змінюється одразу.

**Independent Test**: виключити внесок → у топі −1 без перезавантаження; виключити гравця → зникає з топів; скасувати → повертається.

- [X] T019 [US3] Міграція `supabase/migrations/0076_activity_exclusions.sql`: таблиця `public.activity_exclusions` за data-model.md:
  - `id bigint identity pk`;
  - `event_id bigint references public.activity_events(id) on delete cascade`;
  - `user_id uuid references public.profiles(id) on delete cascade`;
  - `period_from date`, `period_to date`;
  - `reason text not null check (char_length(btrim(reason)) between 3 and 300)`;
  - `created_by uuid not null default auth.uid() references public.profiles(id)`, `created_at timestamptz not null default now()`;
  - `revoked_by uuid references public.profiles(id)`, `revoked_at timestamptz`.

  Check: `(event_id is null) <> (user_id is null)`; для `user_id` обидві дати задані й `period_from <= period_to`; для `event_id` дати null. Унікальні індекси: `(event_id) where revoked_at is null`, `(user_id, period_from, period_to) where revoked_at is null`. RLS: `select using (public.is_admin())`, без політик на запис
- [X] T020 [US3] У `0076` RPC (усі з перевіркою `is_admin()` → `42501`):
  - `activity_exclude_event(p_event bigint, p_reason text) returns bigint` — повтор активного повертає наявний id;
  - `activity_exclude_user(p_user uuid, p_from date, p_to date, p_reason text) returns bigint`;
  - `activity_unexclude(p_exclusion bigint) returns void` — ставить `revoked_by = auth.uid(), revoked_at = now()`; не знайдено → `P0002`;
  - `activity_exclusions_list(p_from date, p_to date)` з ніками автора й того, хто скасував
- [X] T021 [US3] У `0076` `create or replace function public.activity_top(…)`: CTE `excluded` = події з активним виключенням за `event_id` **або** автор з активним виключенням гравця, де `(created_at at time zone 'Europe/Kyiv')::date between period_from and period_to`. Виключені не беруть участі в `row_number` ліміту цін
- [X] T022 [US3] У `0076` `public.activity_user_events(p_user uuid, p_from date, p_to date, p_category text default null)` за contracts/rpc.md: усі події гравця за період (усі статуси), `counted boolean` і `reason` ∈ `over_daily_limit | excluded | player_excluded | role_excluded | pending | rejected | removed | null`; `link`: `prices` → `/prices?buyer=<buyer_id>`, `marks` → `/map?point=<entity_id>`, `guides` → `/guides/<entity_id>` (перевірити наявні маршрути в `src/App.tsx` або роутері й підставити реальні); опис «що» (назва товару й скупника / назва мітки / назва гайду). Сортування `created_at desc`
- [X] T023 [P] [US3] SQL-тест `supabase/tests/activity_exclusions_test.sql`:
  - виключення внеску → `activity_top.cnt − 1`; скасування → назад;
  - виключення гравця за листопад → зникає з топу листопада, лишається в жовтні;
  - причина `''` / 2 символи → `check_violation`;
  - не-admin → `42501` на всі RPC;
  - `activity_user_events` повертає `over_daily_limit` для другого звіту за добу.

  Додати в `run.sh` після `activity_stats_test.sql`
- [X] T024 [US3] `src/components/admin/AdminStats.tsx`: клік на нік → бічна панель (наявний патерн бічних панелей адмінки, з фокус-пасткою й `Esc`):
  - внески з `activity_user_events` (`що · коли (dd.mm HH:mm) · посилання · статус людською мовою`), біля кожного «Виключити» / «Повернути»;
  - угорі «Виключити гравця з конкурсу за цей період»;
  - діалог причини: поле обов'язкове, «Виключити» недоступна, поки причина коротша за 3 символи;
  - після дії — перезавантажити `activity_top` і список (без перезавантаження сторінки)

---

## Phase 6: User Story 4 — Сповіщення на сайті (P2)

**Goal**: адмін надсилає сповіщення; гравець бачить дзвіночок, читає, статус «прочитано» видно адміну.

**Independent Test**: надіслати тестовому гравцю → увійти ним → «1» → відкрити → «0»; в історії адміна «прочитано».

- [X] T025 [US4] Міграція `supabase/migrations/0077_notifications.sql`: таблиця `public.notifications` за data-model.md:
  - `id uuid primary key` (з клієнта);
  - `recipient uuid not null references public.profiles(id) on delete cascade`;
  - `sender uuid references public.profiles(id) on delete set null`;
  - `title text not null check (char_length(btrim(title)) between 1 and 120)`;
  - `body text not null check (char_length(btrim(body)) between 1 and 1500)`;
  - `category text not null check (category in ('prices','marks','guides','other'))`;
  - `prize text not null default '' check (char_length(prize) <= 200)`;
  - `place int check (place between 1 and 10)`;
  - `period_from date`, `period_to date`;
  - `created_at timestamptz not null default now()`, `read_at timestamptz`;
  - `discord_status text not null default 'queued' check (discord_status in ('queued','sent','failed'))`;
  - `discord_error text not null default '' check (char_length(discord_error) <= 300)`;
  - `discord_attempts int not null default 0 check (discord_attempts between 0 and 5)`;
  - `discord_next_at timestamptz not null default now()`, `discord_sent_at timestamptz`.

  Індекси: `(recipient, created_at desc)`; `(recipient) where read_at is null`; `(discord_next_at) where discord_status = 'queued'`. RLS: `select using (recipient = auth.uid() or public.is_admin())`; без політик на запис
- [X] T026 [US4] У `0077` RPC (contracts/rpc.md):
  - `notification_send(p_id uuid, p_recipient uuid, p_title text, p_body text, p_category text, p_prize text, p_place int, p_from date, p_to date) returns uuid` — admin, `insert … on conflict (id) do nothing`, повертає `p_id`;
  - `notifications_admin_list(p_limit int default 100, p_before timestamptz default null)` — admin, з ніками отримувача й відправника;
  - `notification_read(p_id uuid)` — `update … set read_at = coalesce(read_at, now()) where id = p_id and recipient = auth.uid()`;
  - `notifications_read_all() returns int`;
  - `profiles_search_nick(p_q text)` — admin, `≥ 2` символи, `ilike`, до 20 рядків `(id, nick)`.

  Grant `execute` лише `authenticated`
- [X] T027 [P] [US4] SQL-тест `supabase/tests/notifications_test.sql`:
  - admin надсилає A; A бачить 1 рядок, B — 0, anon — 0;
  - A `notification_read` → `read_at` заданий; B викликає `notification_read` на рядок A → `read_at` A не змінився;
  - не-admin `notification_send` → `42501`;
  - повтор `p_id` → 1 рядок;
  - title `''`, 121 символ, body 1501 → `check_violation`;
  - пряме `update notifications` від A → 0 рядків змінено.

  Додати в `run.sh`
- [X] T028 [P] [US4] `src/lib/activityStats.ts` + тест: `winnerTemplate(nick, category, place, period) → { title, body }` — заголовок `🏆 <place> місце: <CATEGORY_LABEL> — <periodLabel>`, текст з привітанням на нік (або «гравцю» без ніку). Тест: місце 1/3, без ніку
- [X] T029 [P] [US4] `src/lib/notifications.ts`:
  - `unreadCount()` — `select('id', { count: 'exact', head: true }).is('read_at', null)`;
  - `listMine(limit = 20)`;
  - `markRead(id)`, `markAllRead()` через RPC
- [X] T030 [US4] `src/components/NotificationBell.tsx` за contracts/ui.md:
  - лише для тих, хто увійшов; лічильник (понад 9 → «9+»), `aria-label="Сповіщення: N непрочитаних"`;
  - випадний список 20 останніх, непрочитані виділені; клік розгортає текст (і приз) та викликає `markRead`; «Позначити все прочитаним»;
  - оновлення: при вході, `setInterval` 60 с, `visibilitychange` → visible; `Esc` і клік поза списком закривають
- [X] T031 [US4] `src/components/Layout.tsx`: вставити `<NotificationBell />` у шапку поруч з кнопкою входу чи профілю
- [X] T032 [US4] `src/components/admin/AdminNotifications.tsx`:
  - форма (модальне вікно): заголовок, текст, категорія (`Ціни скупників | Мітки на мапі | Гайди | Інше`), приз; `id = crypto.randomUUID()` при відкритті; «Надіслати» блокується на час запиту; помилки біля полів;
  - пошук отримувача за ніком (`profiles_search_nick`) для ручного режиму;
  - «Історія сповіщень»: таблиця з `notifications_admin_list` (`кому · від кого · коли · категорія · приз · прочитано (час) / ні · Discord`), кнопка «Оновити»
- [X] T033 [US4] `src/components/admin/AdminStats.tsx`: кнопка «Сповістити» біля кожного рядка топу → форма з T032 з `winnerTemplate(...)`, `category`, `place`, `period`; підвкладка або посилання «Історія сповіщень»

---

## Phase 7: User Story 5 — Discord DM і статус доставки (P3)

**Goal**: бот пробує надіслати DM; адмін бачить «доставлено / не доставлено (причина) / в черзі».

**Independent Test**: гравець з відкритими DM і спільним сервером → «доставлено»; без спільного сервера → «не доставлено — закриті особисті повідомлення або немає спільного сервера з ботом».

- [X] T034 [US5] Міграція `supabase/migrations/0078_notifications_dm.sql`:
  - `alter table public.discord_bot add column if not exists dm_on boolean not null default true`;
  - `public.notification_dm_batch(p_limit int default 20)` — `queued` з `discord_next_at <= now()`, `for update skip locked`, разом з `discord_user_id` з `auth.identities` (`provider = 'discord'`, `provider_id`);
  - `public.notification_dm_result(p_id uuid, p_status text, p_error text)`: `sent` → `discord_sent_at`; `retry` → `attempts + 1`, паузи 1, 2, 4, 6 хв (разом ≈ 13 хв, SC-007 ≤ 15 хв), на 5-й спробі → `failed` з « (спроби вичерпано)»; `failed`.

  `revoke execute … from public, anon, authenticated; grant execute … to service_role`
- [X] T035 [P] [US5] Доповнити `supabase/tests/notifications_test.sql`: anon і authenticated → `42501` на `notification_dm_batch` і `notification_dm_result`; `retry` п'ять разів → `failed`; `discord_user_id` береться з `auth.identities`
- [X] T036 [P] [US5] `supabase/functions/discord-bot/discord.ts`: `openDm(userId)` → `POST /users/@me/channels {recipient_id}`; `send` приймає `allowed_mentions`. `DiscordError` зберігає числовий `code` з тіла відповіді
- [X] T037 [P] [US5] `supabase/functions/discord-bot/dm.ts`:
  - `dmBody(n)` → embed `{title, description: body + (prize ? '\n\n🎁 Приз: ' + prize : '')}`, `allowed_mentions: { parse: [] }`;
  - `dmOutcome(err)` → `{ status, error }` за таблицею contracts/discord-dm.md (`50007`, `10013`/404, 401, 429/5xx/мережа);
  - `sendDms(db, dc, opts)` — пакет 20; помилка одного не зупиняє решту
- [X] T038 [P] [US5] `supabase/functions/discord-bot/dm.test.ts` (vitest, підміна `fetch`): успіх → `sent`; `50007` → `failed` з текстом про закриті DM; `10013` → «Акаунт Discord не знайдено»; `429` → `retry`; порожній приз — без рядка «Приз»; `allowed_mentions.parse` завжди `[]`
- [X] T039 [US5] `supabase/functions/discord-bot/index.ts`: у дії `tick` після цін і міток — `sendDms`. Якщо `dm_on = false` або немає `TOKEN` → кожному `failed` «надсилання в Discord вимкнено». Помилка кроку не валить `tick` (лише `markError`)
- [X] T040 [US5] `src/components/admin/AdminNotifications.tsx`: колонка Discord — «в черзі» / «доставлено» / «не доставлено — <discord_error>»; `src/components/admin/AdminNotifications.tsx` (не у формі бота, щоб не залежати від її «Зберегти») — перемикач «Особисті повідомлення переможцям» (`dm_on`)

---

## Phase 8: User Story 6 — Налаштування правил зарахування (P3)

**Goal**: адмін змінює ліміт цін і ролі без участі без зміни коду.

**Independent Test**: ліміт 1 → 2 — гравець з 3 звітами товару за добу отримує 2; зняти `moderator` з ролей без участі — модератори з'являються в топі.

- [X] T041 [US6] Міграція `supabase/migrations/0079_activity_settings_rpc.sql`:
  - `activity_settings_get()` — admin;
  - `activity_settings_set(p_price_daily_limit int, p_excluded_roles text[])` — admin, межі «1…50» і ролі з `user/editor/moderator/admin` → інакше `22023`; пише `updated_by/updated_at`;
  - `activity_resync() returns int` — admin, викликає `activity_sync_all()`
- [X] T042 [P] [US6] Доповнити `supabase/tests/activity_stats_test.sql`: ліміт 2 → `cnt` зростає; ліміт 0 і 51 → `22023`; роль `'boss'` → `22023`; зняти `moderator` → модератор у топі; не-admin → `42501`
- [X] T043 [US6] `src/components/admin/AdminStats.tsx`: згортаний блок «Налаштування»: число 1–50, чекбокси ролей, «Зберегти» (помилка біля поля, після збереження — перезавантажити топ); кнопка «Звірити з джерелами» → `activity_resync`, показати «Змінено N подій»

---

## Phase 9: Polish & Cross-Cutting

- [X] T044 [P] `src/data/sitenews.json`: новина для гравців про дзвіночок сповіщень на сайті (у `changelog.json` програми не писати: програма не змінюється)
- [ ] T045 [P] Доступність адмін-вкладки й дзвіночка: фокус видно, усе з клавіатури, `aria-live` для «Скопійовано» й лічильника; перевірити ширину 375 px (таблиця історії прокручується в контейнері, а не сторінка)
- [ ] T046 `npm.cmd test`, `npm.cmd run typecheck`, `bash supabase/tests/run.sh` — усе зелене; пройти ручний сценарій з `specs/091-activity-stats/quickstart.md` (кроки 1–9) і контрольний SQL ціни
- [ ] T047 Підготувати власнику SQL міграцій 0075–0079 для ручного накату через буфер (не в чат), у порядку номерів; після накату — `select public.activity_sync_all();` і перевірка топу за поточний місяць. Функцію бота перевикласти з `--yes`

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → далі історії.
- **US1** (T011–T015) залежить лише від Phase 2. **US2** (T016–T018) — від US1 (дані топу на екрані).
- **US3** (T019–T024) — від US1 (замінює CTE `excluded` у `activity_top`).
- **US6** (T041–T043) — від Phase 2 (таблиця налаштувань); з US3 перетинається лише файлом `AdminStats.tsx`.
- **US4** (T025–T033) — незалежна від US2/US3/US6; T033 потребує T014.
- **US5** (T034–T040) — від US4 (таблиця `notifications`).
- Номери міграцій ідуть по порядку поставки. Якщо порядок PR зміниться, перенумерувати до злиття.

## Parallel Example

```text
Phase 2:  T009 (SQL-тест) ‖ T010 (activityStats.ts) — після T004–T008
US1:      T012 (SQL-тест) ‖ T013 (vitest) — після T011
US2:      T016 ‖ T017
US4:      T027 ‖ T028 ‖ T029 — після T025–T026
US5:      T035 ‖ T036 ‖ T037 ‖ T038 — після T034
```

## Implementation Strategy

1. **MVP = Phase 1–4 (US1 + US2)**: перший PR. Власник уже може зробити оголошення за листопад.
2. **PR 2 = US3 + US6**: виключення й налаштування (захист від накруток).
3. **PR 3 = US4**: сповіщення на сайті.
4. **PR 4 = US5**: DM (поки бот лише на службовому сервері, більшість статусів очікувано «не доставлено»).

Після кожного PR — зелені тести і власник накочує відповідні міграції. Перед злиттям перевірити, що PR ще відкритий (пам'ять проєкту: `check-pr-open-before-push.md`).
