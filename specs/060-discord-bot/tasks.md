# Tasks: Discord-бот Q-Hub — новини й ціни скупників у канал

**Input**: Design documents from `specs/060-discord-bot/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/discord-bot-function.md, contracts/messages.md, quickstart.md

**Tests**: обов'язкові за конституцією, принцип VI — SQL-тест на нові права й тригер черги, модульні тести на чисту логіку
функції (`vitest`, `supabase/functions/**/*.test.ts` уже в `vite.config.ts`).

**Organization**: рішення власника 2026-11-04 — **перший реліз (MVP) = US1 ціни + мінімум US3** (стан бота, канали,
пробне повідомлення). US2 новини — окремою фазою й окремим релізом після MVP. US4 — лише список серверів бота в
стані (дія `status`), читання каналів не робимо (FR-011). Міграція — `0055` (`0052` і `0054` зайняті).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можна робити паралельно (інші файли, немає залежностей від незавершених задач)
- **[Story]**: US1 / US2 / US3 / US4

---

## Phase 1: Setup

- [ ] T001 Перевірити за документацією Discord (developers: Channels → Crosspost Message, Rate Limits) ліміт пересилань з каналу-оголошення (очікуємо 10 на годину на канал) і потрібні права бота для `POST /channels/{id}/messages` і `/crosspost` у власному каналі; якщо ліміт інший — змінити default `crosspost_per_hour` у `specs/060-discord-bot/data-model.md` і `research.md` R3
- [ ] T002 Перевірити, що номер `0055` вільний у `main` і гілках `origin/*` (`git ls-tree` по `supabase/migrations/`); якщо зайнятий — узяти наступний і замінити в `plan.md`, `data-model.md`, `quickstart.md` і задачах нижче
- [ ] T003 Перевірити, що `/tsiny#<buyer_id>` відкриває потрібного скупника в `src/pages/Prices.tsx` (наявне `pick(g.buyer_id)` через хеш); якщо при першому завантаженні хеш не читається — додати читання `location.hash` при монтуванні, щоб посилання з Discord вело на скупника (US1 AC5)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: схема бази, права, REST-клієнт Discord і каркас функції — потрібні всім історіям.

**⚠️ CRITICAL**: жодна історія не починається до завершення цієї фази.

### Тести (спершу, мають падати)

- [ ] T004 [P] SQL-тест у `supabase/tests/discord_bot_test.sql` (шаблон — `supabase/tests/admin_panel_test.sql`: `auth.users` + `profiles.role`, `set role anon|authenticated`, `request.jwt.claim.sub`): `anon`, `user`, `editor`, `moderator` не читають і не пишуть `discord_bot`, `discord_outbox`, `discord_posts`, `news_drafts`; `admin` читає й пише всі чотири; `discord_bot` має рівно один рядок (вставка другого — помилка); check відхиляють `guild_id` / `prices_channel_id` / `news_channel_id` не `''` і не `^\d{17,20}$`, `window_min` поза 1–60, `crosspost_per_hour` поза 1–50, `last_error` > 500, `discord_posts.status` поза `('sending','sent','failed')`, `news_drafts.title` поза 1–120, пункт `added`/`changed`/`removed` > 300, `image_url` / `link` не `''` і не `^https://`, `news_drafts.status` поза `('draft','sent','skipped','merged')`, дубль `source_ref`; тригер черги: при `prices_on = false` зміна `buyer_items.price` не додає рядок у `discord_outbox`; при `prices_on = true` — додає один рядок з `price`, `prev_price` = попередня ціна з `price_history` цього скупника й предмета (перша ціна — `prev_price is null`), `post_key is null`; видалення скупника каскадно прибирає його події. Додати `$P -f supabase/tests/discord_bot_test.sql` у `supabase/tests/run.sh`

### Реалізація

- [ ] T005 Міграція `supabase/migrations/0055_discord_bot.sql` (ідемпотентна: `if not exists`, `drop policy if exists`, `create or replace`; повторний запуск без помилок), за `data-model.md`:
  - `public.discord_bot`: `id boolean primary key default true check (id)`, `guild_id`, `prices_channel_id`, `news_channel_id` — `text not null default ''` з check `'' or ~ '^\d{17,20}$'`; `prices_on boolean not null default false`, `news_on boolean not null default false`, `window_min int not null default 5` check 1–60, `crosspost_per_hour int not null default 10` check 1–50, `last_ok_at timestamptz`, `last_error text not null default ''` check ≤ 500; `insert ... values (true) on conflict do nothing`
  - `public.discord_outbox`: `id bigint generated always as identity primary key`, `buyer_id text not null references public.buyers on delete cascade`, `item_id bigint not null references public.items on delete cascade`, `price bigint not null`, `prev_price bigint`, `at timestamptz not null`, `post_key text`, `posted_at timestamptz`; індекс `discord_outbox_queue on (at) where post_key is null`
  - `public.discord_posts`: `key text primary key`, `channel_id text not null`, `message_id text`, `crossposted boolean not null default false`, `status text not null check (status in ('sending','sent','failed'))`, `error text not null default ''` check ≤ 500, `created_at timestamptz not null default now()`; індекс `(channel_id, created_at desc)` — для ліміту години
  - `public.news_drafts`: `id bigint identity pk`, `source_ref text not null unique`, `title text not null` check `char_length between 1 and 120`, `added` / `changed` / `removed text[] not null default '{}'` з check, що кожен пункт ≤ 300 (функція `public.news_items_ok(text[])` immutable), `image_url` і `link text not null default ''` check `'' or ~ '^https://'`, `status text not null default 'draft' check (status in ('draft','sent','skipped','merged'))`, `sent_at timestamptz`, `created_at timestamptz not null default now()`
  - RLS на всіх чотирьох: одна політика `for all using (public.is_admin()) with check (public.is_admin())`; `grant select, insert, update, delete` для `authenticated`, для `anon` — нічого
  - тригер `discord_outbox_from_history after insert on public.price_history` (функція `security definer set search_path = ''`): якщо `(select prices_on from public.discord_bot)` — вставити подію з `prev_price` = остання ціна з `price_history` того ж `buyer_id, item_id` з `at < new.at` (або `id < new.id`)
  - **без** `cron.schedule` у міграції: тестова база (`run.sh`) не має `pg_cron`; розклад — окремим кроком у T012
- [ ] T006 [P] REST-клієнт `supabase/functions/discord-bot/discord.ts`: `API = 'https://discord.com/api/v10'`, заголовок `Authorization: Bot <DISCORD_BOT_TOKEN>`; `send(channelId, body)` → `message_id`, `crosspost(channelId, messageId)`, `channel(channelId)` (назва, тип; 5 — оголошення), `me()`, `guilds()`; `429` → чекати `retry_after` і повторити один раз, далі кинути помилку `rate`; `403` / `404` → помилка з текстом «Дай боту право писати в #<канал>» / «Канал не знайдено» (US3 AC3); токен ніколи не потрапляє в текст помилки
- [ ] T007 Каркас `supabase/functions/discord-bot/index.ts` за `contracts/discord-bot-function.md` і зразком `supabase/functions/rules-sync/index.ts`: CORS, лише POST, `allowed(req)` = `x-sync-secret === DISCORD_SYNC_SECRET` **або** сесія з `rpc('my_role') === 'admin'` (інакше 403 «Лише адміністратор»); дії `tick` і `drafts` — лише з секретом; `send`, `test`, `status` — лише admin; клієнт бази — service role; невідома дія — 400. Після кожної успішної дії з Discord — `discord_bot.last_ok_at = now(), last_error = ''`, після помилки — `last_error` (≤ 500)

**Checkpoint**: T004 зелений у `supabase/tests/run.sh`; `npx.cmd vitest run supabase/functions` без нових падінь.

---

## Phase 3: User Story 1 — Ціни скупників з'являються в Discord самі (Priority: P1) 🎯 MVP

**Goal**: підтверджені зміни цін за вікно — одним новим повідомленням у канал-оголошення `#ціни` з пересиланням підписникам.

**Independent Test**: підтвердити нову ціну одного предмета → не пізніше ніж за 2 хв після вікна в `#ціни` одне
повідомлення зі скупником, ціною й «▲ +N» / «▼ −N» / «● нове»; на тестовому сервері-підписнику — те саме.

### Тести

- [ ] T008 [P] [US1] `supabase/functions/discord-bot/prices.test.ts`: `due(events, now, windowMin)` — false, поки від найстарішої події не минуло `windowMin`, true після; `allowed(postsLastHour, perHour)` — false при `posts >= perHour`; `group(events)` — кілька змін того самого предмета у вікні дають одну (остання ціна, `prev` — з найстарішої), групи за скупником у порядку `buyers.sort`; `postKey(events)` = `'prices:' + min(id)`, частини — `':2'`, `':3'`; зміна, що повернула ціну до `prev`, з повідомлення випадає
- [ ] T009 [P] [US1] `supabase/functions/discord-bot/format.test.ts` (ціни, за `contracts/messages.md`): `content` = «🛒 Оновлення цін скупників · 14:32» за Києвом (`Europe/Kyiv`, перевірити зимовий і літній час); embed на скупника: `title` — назва, `url` — `https://q-hub.fun/tsiny#<buyer_id>`; рядки «Предмет — `1 250 $` ▲ +50 / ▼ −20 / ● нове» з пробілом тисяч; `footer` «Наступна зміна: сьогодні о 18:00 · Q-Hub», якщо `next_change_at` у майбутньому, інакше «Q-Hub»; > 10 скупників — кілька тіл з «(2/2)» у `content`; embed > 4096 символів опису ділиться, а не обрізається; ніде немає ніків чи `by`

### Реалізація

- [ ] T010 [P] [US1] Чисте `supabase/functions/discord-bot/prices.ts` (без Deno й мережі, щоб пройшов T008): `due`, `allowed`, `group`, `postKey`, `parts(groups, 10)`
- [ ] T011 [P] [US1] Чисте `supabase/functions/discord-bot/format.ts` → `pricesMessage(groups, { now, site: 'https://q-hub.fun' })` → масив тіл `{ content, embeds }` (щоб пройшов T009); колір embed — акцент сайту (взяти з `src/styles.css`, числом); без імпортів з Deno, щоб T020/T026 могли імпортувати його на сайті
- [ ] T012 [US1] Дія `tick` в `supabase/functions/discord-bot/index.ts`: якщо `!prices_on` або немає `prices_channel_id` — `{ posted: 0, reason: 'вимкнено' }`; прочитати події `post_key is null` (з `buyers.name, sort, next_change_at`, `items.name`); `due` ні — `{ waiting: n }`; порахувати `discord_posts` каналу за годину, `allowed` ні — `{ waiting: n, reason: 'ліміт години' }` (події лишаються й підуть одним зведенням пізніше); для кожної частини: `insert discord_posts (key, status 'sending') on conflict do nothing` — якщо рядок уже `sent` з `message_id`, лише доробити `crosspost`; `send` → `crosspost` (лише якщо канал типу 5) → `status 'sent'`, `message_id`; позначити всі події вікна `post_key`, `posted_at`; помилка — `status 'failed'`, події лишаються в черзі (SC-002)
- [ ] T013 [US1] Розклад: файл `supabase/sql/discord_cron.sql` (запускає власник у SQL Editor після T005, не міграція): секрет і адреса функції — у `vault.create_secret` (`discord_sync_secret`, `discord_fn_url`), `cron.schedule('discord-tick', '* * * * *', ...)` з `net.http_post(url, headers = {'x-sync-secret': ...}, body = '{"action":"tick"}')`, повторний запуск — `cron.unschedule` спершу; у шапці — що ввімкнути `pg_cron` і `pg_net` (Database → Extensions) і що секрет у файл не вписувати
- [ ] T014 [P] [US1] Запасний шлях без `pg_cron`: `.github/workflows/discord-tick.yml` за зразком `.github/workflows/rules-sync.yml` — `schedule: '*/5 * * * *'` + `workflow_dispatch`, `curl -X POST .../functions/v1/discord-bot -H "x-sync-secret: $SECRET" -d '{"action":"tick"}'`; без `secrets.DISCORD_SYNC_SECRET` — `::warning::` і `exit 0`. Увімкнений за замовчуванням лише `workflow_dispatch`, `schedule` — закоментований з поясненням (щоб не дублювати pg_cron)

**Checkpoint**: сценарії 3–7 з `quickstart.md` (при вимкненому `prices_on` бот мовчить).

---

## Phase 4: User Story 3 — Налаштування бота власником (Priority: P2, мінімум у MVP)

**Goal**: в адмінці видно, чи бот на зв'язку, на яких він серверах, які канали; власник змінює канали, вмикає ціни
й надсилає пробне повідомлення.

**Independent Test**: «Discord-бот» в адмінці → «на зв'язку», сервер, канал цін; змінити канал → «Надіслати пробне» →
повідомлення в новому каналі; канал без прав → «Дай боту право писати в #…»; `editor` не бачить розділу й база відхиляє.

- [ ] T015 [US3] Дії `status` і `test` в `supabase/functions/discord-bot/index.ts`: `status` → `{ online: me() ok, bot: name, guilds: [{ id, name }], channels: { prices: { id, name, announcement }, news: {...} }, last_ok_at, last_error, last_posts: 5 останніх discord_posts }`; `test { channel: 'prices' | 'news' }` → пробне «Пробне повідомлення Q-Hub — бот бачить цей канал і може писати.» (ключ `test:<iso час>`, без crosspost) → `{ ok, error? }` з людським текстом з T006. Список серверів — це весь US4 у цьому релізі
- [ ] T016 [US3] Розділ `src/components/admin/AdminDiscordBot.tsx` (обгортка `AdminSection`, як `AdminLinks.tsx`): стан «На зв'язку» / «Немає зв'язку» + `last_error`, сервери бота, вибір сервера Q-Hub; поля «Канал цін» і «Канал новин» — id каналу (17–20 цифр, підказка «ПКМ по каналу → Копіювати ID», помилка під полем при blur) з назвою каналу зі `status` і позначкою «не оголошення — підписники не отримають»; перемикачі «Публікувати ціни», «Публікувати новини»; «Вікно збирання, хв» і «Пересилань на годину»; «Зберегти» (update `discord_bot`); «Надіслати пробне» біля кожного каналу; останні 5 публікацій з часом і станом. Виклики — `supabase.functions.invoke('discord-bot', { body: { action } })`
- [ ] T017 [US3] Вкладка в `src/pages/Admin.tsx`: `['discord', 'Discord-бот']` у `TABS` і `{tab === 'discord' && <AdminDiscordBot />}`
- [ ] T018 [P] [US3] Стилі розділу в `src/styles.css` (лише якщо наявних класів адмінки бракує): рядок стану з крапкою кольору, поле id каналу моноширинне, на 375 px — без горизонтального скролу

**Checkpoint**: сценарії 1, 2, 10, 11 з `quickstart.md`. **Тут MVP готовий до злиття** (Phase 7 → T029–T032).

---

## Phase 5: User Story 2 — Новини Q-Hub у Discord через чернетку в адмінці (Priority: P1, другий реліз)

**Goal**: після деплою з новим записом журналу в адмінці з'являється чернетка; власник переглядає «як у Discord», править
і надсилає — одне повідомлення в `#новини`.

**Independent Test**: деплой з новим записом `src/data/changelog.json` → чернетка з тими самими пунктами; правка →
«Надіслати в Discord» → одне повідомлення з виправленим текстом; вдруге — «Вже надіслано».

### Тести

- [ ] T019 [P] [US2] `supabase/functions/discord-bot/changelog.test.ts`: запис журналу (`id`, `version?`, `added / changed / fixed`) → `{ source_ref: 'changelog:<id>', title: 'Q-Hub <version> — що нового' | 'Q-Hub — що нового <дата>', added, changed: [...changed, ...fixed], removed: [] }`; запис `sitenews.json` → `source_ref: 'site:<id>'`; пункт > 300 символів обрізається на межі слова з «…»; порожній запис — `null`
- [ ] T020 [P] [US2] Доповнити `supabase/functions/discord-bot/format.test.ts`: `newsMessage(draft)` за `contracts/messages.md` — групи «**Додано** / **Змінено** / **Прибрано**» з «• », порожні групи не показуються, `url` і `image` лише якщо задані, `footer` «Q-Hub · q-hub.fun»; `newsTooLong(draft)` повертає, на скільки символів перевищено 4096

### Реалізація

- [ ] T021 [P] [US2] Чисте `supabase/functions/discord-bot/changelog.ts` (щоб пройшов T019) і `newsMessage` / `newsTooLong` у `supabase/functions/discord-bot/format.ts` (щоб пройшов T020)
- [ ] T022 [US2] Дії `drafts` і `send` в `supabase/functions/discord-bot/index.ts`: `drafts { changelog?, site? }` (лише секрет) → `insert news_drafts ... on conflict (source_ref) do nothing` → `{ created, skipped }`; `send { draft_id }` (лише admin) → якщо `!news_on` чи немає `news_channel_id` — зрозуміла помилка; `newsTooLong` → 400 з кількістю зайвого; ключ `news:<id>` у `discord_posts` як у T012 (вдруге — `{ already: true }`), `send` + `crosspost`, `news_drafts.status = 'sent', sent_at = now()`. Бот недоступний — `failed`, кнопка дає повторити, дубля немає (US2 AC8)
- [ ] T023 [P] [US2] Новий `src/data/sitenews.json` — той самий формат, що `src/data/changelog.json` (`[{ id, added, changed, fixed }]`), лише зміни сайту мовою гравця; перший запис — про цю функцію («Q-Hub тепер у Discord: ціни скупників у #ціни»)
- [ ] T024 [US2] Крок у `.github/workflows/deploy.yml` після успішного деплою з `main`: `node -e` бере верхній запис `src/data/changelog.json` і `src/data/sitenews.json` і шле `{"action":"drafts","changelog":…,"site":…}` на функцію з `x-sync-secret: ${{ secrets.DISCORD_SYNC_SECRET }}`; без секрету — `::warning::` і далі; помилка функції не валить деплой (`continue-on-error: true`)
- [ ] T025 [P] [US2] Перегляд `src/components/admin/DiscordPreview.tsx`: приймає `{ content, embeds }` з `format.ts` і малює як Discord — темний фон незалежно від теми сайту, смуга кольору embed ліворуч, заголовок-посилання, опис з `**жирним**` і «• », картинка, footer; без `dangerouslySetInnerHTML` (жирний — розбором `**…**` у вузли)
- [ ] T026 [US2] Розділ `src/components/admin/AdminNews.tsx`: список чернеток (фільтр «Чернетки / Надіслані / Не публікувати»), відкрита чернетка — поля «Заголовок», «Додано», «Змінено», «Прибрано» (пункт на рядок), «Картинка (https://…)», «Посилання»; поруч `DiscordPreview` з `newsMessage(draft)` наживо; лічильник символів і блок «Надіслати» при `newsTooLong`; кнопки «Зберегти», «Надіслати в Discord» (підтвердження з назвою каналу), «Не публікувати»; вибір кількох → «Об'єднати» (нова чернетка `merged:<ids>` з усіма пунктами, вихідні → `merged`); «Нова новина» → `manual:<crypto.randomUUID()>`. Вкладка `['news', 'Новини']` у `src/pages/Admin.tsx`
- [ ] T027 [US2] Спогад `.claude/memory/site-news-sitenews-json.md` + рядок у `.claude/memory/MEMORY.md`: зміна лише сайту → запис у `src/data/sitenews.json` (не в `changelog.json`), з нього чернетка новини в адмінці; оновити `.claude/memory/changelog-program-only.md` посиланням `[[site-news-sitenews-json]]`

**Checkpoint**: сценарії 8–9 з `quickstart.md`.

---

## Phase 6: User Story 4 — Готовність читати інші сервери (Priority: P3, лише основа)

**Goal**: бот на чужому сервері нічого не читає; власник бачить список серверів бота (зроблено в T015/T016).

- [ ] T028 [US4] У `specs/060-discord-bot/quickstart.md` (розділ «Підготовка») записати: у Developer Portal → Bot вимкнені `MESSAGE CONTENT INTENT` і `SERVER MEMBERS INTENT`; посилання-запрошення лише з `scope=bot` і правами Send Messages + Embed Links + Manage Messages (без Read Message History); функція не має Gateway-з'єднання, тож на чужому сервері нічого не читає (US4 AC1)

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T029 [P] Перевірка секретів (SC-006): `npm.cmd run build`, потім пошук `DISCORD_BOT_TOKEN`, `Bot ` + довгий токен і `DISCORD_SYNC_SECRET` у `dist/` і `git grep` у репо — нічого, крім назв змінних у функції й workflow
- [ ] T030 [P] Оновити `docs/PLAN.md`: пункт «Discord-бот: ціни в #ціни» — `[x]` після MVP, новини — окремим пунктом; «Скан Discord-ринку» лишити з приміткою, що бот уже є й потрібна функція читання
- [ ] T031 Прогнати `npx.cmd vitest run` і `npx.cmd tsc --noEmit -p .` (сайт імпортує `format.ts` функції — перевірити, що збірка сайту його бере); `supabase/tests/run.sh` — у CI PR
- [ ] T032 Пройти `specs/060-discord-bot/quickstart.md` на живому каналі: застосувати `0055` у SQL Editor (пам'ять prod-migrations-gaps — перевірити, що таблиці з'явились), `npx.cmd supabase functions deploy discord-bot`, запустити `supabase/sql/discord_cron.sql`, сценарії 1–7 і 10–11. Програму (`desktop/`) не змінюємо — запис у `src/data/changelog.json` не потрібен

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без залежностей
- **Foundational (Phase 2)**: після Setup; блокує всі історії
- **US1 (Phase 3)**: після Phase 2
- **US3 (Phase 4)**: після Phase 2; для живої перевірки цін потрібен T016 (увімкнути `prices_on` і канал без SQL), тож у MVP US1 і US3 йдуть разом
- **US2 (Phase 5)**: після Phase 2 і T011 (`format.ts`); окремий реліз після MVP
- **US4 (Phase 6)**: покрито T015/T016, лишається документація
- **Polish (Phase 7)**: T029–T032 — перед злиттям MVP і ще раз перед злиттям US2

### User Story Dependencies

- **US1**: незалежна від інших історій у коді; вмикається через `discord_bot` (SQL або US3)
- **US3**: незалежна; пробне повідомлення перевіряється без US1
- **US2**: використовує `discord.ts`, `discord_posts` і `format.ts` з Phase 2 / US1, але не логіку цін

### Within Each User Story

- Тести (T008/T009, T019/T020) пишуться першими й падають
- Чисті модулі (`prices.ts`, `format.ts`, `changelog.ts`) → дії функції → адмінка → розклад / CI

### Parallel Opportunities

- T001, T002, T003 — паралельно
- T004 і T006 — паралельно (SQL-тест і REST-клієнт); T005 після T004, T007 після T006
- US1: T008 ∥ T009, потім T010 ∥ T011; T014 ∥ T012
- US3 можна робити паралельно з US1 після Phase 2 (інші файли, крім `index.ts` — його правити по черзі)
- US2: T019 ∥ T020 ∥ T023 ∥ T025

---

## Parallel Example: User Story 1

```text
# Тести разом:
T008 supabase/functions/discord-bot/prices.test.ts
T009 supabase/functions/discord-bot/format.test.ts

# Чисті модулі разом:
T010 supabase/functions/discord-bot/prices.ts
T011 supabase/functions/discord-bot/format.ts
```

---

## Implementation Strategy

### MVP First (US1 + мінімум US3)

1. Phase 1 → Phase 2 (міграція 0055, права, REST, каркас)
2. Phase 3 (ціни) + Phase 4 (стан, канали, пробне)
3. **STOP and VALIDATE**: власник створює бота й канали-оголошення, ставить секрети, вмикає `pg_cron` / `pg_net`;
   T029–T032; сценарії 1–7, 10–11
4. Злиття в `main` — перший реліз

### Incremental Delivery

1. MVP → ціни в `#ціни`, підписники отримують пересилання
2. US2 новини (Phase 5 + T029–T031) → другий реліз
3. US4 читання інших серверів — окрема майбутня специфікація (беклог «Скан Discord-ринку»)

### Що потрібно від власника (без коду, до T032)

- Discord Developer Portal → New Application → Bot → токен → `npx.cmd supabase secrets set DISCORD_BOT_TOKEN=…` (у чат не надсилати)
- `DISCORD_SYNC_SECRET` — однаковий у секретах функції й GitHub Secrets
- Запросити бота на сервер Q-Hub; канали `#ціни` і `#новини` типу «Оголошення»
- Supabase → Database → Extensions: `pg_cron`, `pg_net`

---

## Notes

- [P] — інші файли, без залежностей від незавершених задач
- `supabase/functions/discord-bot/index.ts` правлять T007, T012, T015, T022 — по черзі, не паралельно
- Комітити після кожної задачі чи логічної групи
- Ніків тих, хто вносив ціни, ніде в повідомленнях (FR-012); токен — лише в секретах (FR-010)
