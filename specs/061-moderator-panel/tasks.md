# Tasks: Зрозуміла панель для модераторів

**Input**: Design documents from `specs/061-moderator-panel/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/panel-ui.md, quickstart.md

**Tests**: потрібні — конституція VI (чиста логіка → `vitest`) і SC-003 (тест заборонених слів, research R10). SQL-тестів не треба: права не змінюються (research R11).

**Organization**: за історіями зі spec.md. База, міграції, права — без змін у жодній задачі. Програма `desktop/` не зачіпається → `changelog.json` не змінюється.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можна паралельно (інший файл, немає залежності від незавершених задач)
- **[Story]**: US1…US6 зі spec.md

---

## Phase 1: Setup

- [X] T001 Створити теку `src/components/panel/` і порожній `src/lib/panel.ts` з типами з data-model: `TaskKind = 'edit' | 'new_page' | 'hide_page' | 'stale_point' | 'new_point'`, `QueueFilter = 'all' | TaskKind | 'conflict'`, `QueueSummary { total; conflicts; oldest_at: string | null; by: Partial<Record<TaskKind, number>> }`, `Decision { at; action: 'published' | 'published_edited' | 'rejected' | 'reverted' | 'hidden' | 'unhidden'; section; target_id: string | null; title; reason }`, `DraftSummary { new; published; rejected }`

---

## Phase 2: Foundational (блокує всі історії)

**Purpose**: чиста логіка з тестами і спільний розбір, винесений з `AdminWiki.tsx` без зміни поведінки вкладки адміна.

- [X] T002 [P] `src/lib/panel.test.ts`: тести на `taskKind` (map_point + hide → `stale_point`, map_point + new → `new_point`, інакше за kind: edit → `edit`, new → `new_page`, hide → `hide_page`); `summarize` (порожньо → `total 0`, `oldest_at null`, `by {}` — види з нулем відсутні; `conflicts` рахує `status = 'conflict'`; `oldest_at` — мінімальний `created_at`); `nextProposal` (наступна після `decidedId` у фільтрі; після останньої — перша у фільтрі, крім `decidedId`; порожньо → `null`; фільтр `conflict` бере лише конфлікти); `mergeDecisions` (злиття пропозицій і версій `revert/hide/unhide`; версія `hide` з тим самим `version_id`, що й пропозиція, не дублюється; спадання за `at`; не більше 50); `draftCounts` (`new`, `published`, `rejected`); `panelError` (таблиця з data-model: `QH012` → «Цю пропозицію вже розібрав <нік>.», без ніка — «інший модератор»; `QH010` / row-level / permission → «У тебе більше немає прав на цю дію. Онови сторінку.»; інший `QH0xx` — текст бази; решта → «Не вдалося зв'язатися з сайтом. Спробуй ще раз або напиши власнику.»)
- [X] T003 Реалізувати в `src/lib/panel.ts`: `taskKind`, `summarize`, `nextProposal(list, decidedId, filter)` (list відсортований за `created_at` зростанням), `mergeDecisions(proposals, versions)`, `draftCounts(rows)`, `panelError(e, nick?)`, `matches(filter, p)`; також `KIND_LABEL` (людські назви видів: «Правки», «Нові сторінки», «Прибрати сторінку», «Точка застаріла», «Нові мітки») і `age(s)` (перенести з `AdminWiki.tsx`) — T002 зелений
- [X] T004 Винести з `src/components/admin/AdminWiki.tsx` відкриту пропозицію в `src/components/panel/ProposalView.tsx`: пропси `proposal`, `onDecided(action)`, `onClose`; усередині — завантаження поточної картки, скріна, «Підправити перед публікацією», відхилення з причиною, заборона автору, конфлікт (`QH013` → `needForce`). Поведінка 1:1 з нинішньою
- [X] T005 Винести список черги з `AdminWiki.tsx` у `src/components/panel/ReviewQueue.tsx`: завантаження `wiki_proposals` (`status in pending, conflict`, з `who`), фільтр, вибір пропозиції, рендер `ProposalView`; `AdminWiki` рендерить `ReviewQueue`
- [X] T006 Перенести `Hidden` і `Bans` з `AdminWiki.tsx` у `src/components/panel/HiddenAndBans.tsx` (експорт обох); `AdminWiki` лишає в себе лише `Settings` і рендерить `<ReviewQueue/> <Hidden/> <Bans/> <Settings/>`
- [X] T007 Перевірка: `npx.cmd tsc --noEmit -p .`, `npx.cmd vitest run` зелені; вкладка «Довідник» адміна вигляд і дії без змін (quickstart, сценарій 12 — частина «Довідник»)

**Checkpoint**: логіка протестована, розбір — спільний компонент; адмін нічого не помітив.

---

## Phase 3: User Story 1 — Модератор одразу бачить, що чекає на нього (P1) 🎯 MVP

**Goal**: `/panel` з «Чекає на тебе»; клік веде до розбору з потрібним фільтром.

**Independent Test**: quickstart, сценарії 2 і 3.

- [X] T008 [US1] `src/pages/Panel.tsx`: доступ — `editor`, `moderator`, `admin`; `user` і гість — `<NotFound/>` (як `Admin.tsx:38`); підмаршрути `''` → `PanelHome`, `rozbir`, `rishennia`, `prybrani`; для `editor` три останні — `<Navigate to="/panel" replace/>` (contracts/panel-ui.md «Адреси»)
- [X] T009 [US1] `src/App.tsx`: `const Panel = lazy(() => import('./pages/Panel'))`, маршрут `<Route path="panel/*" element={<Panel/>}/>` поруч з `admin`
- [X] T010 [US1] `src/components/panel/PanelHome.tsx`, блок «Чекає на тебе» (moderator, admin): один запит `wiki_proposals` `select('section,kind,status,created_at')` зі `status in ('pending','conflict')`, `summarize`; рядок на кожен вид із числом > 0: «<число> <KIND_LABEL> · найстаріша <age>» → `/panel/rozbir?f=<вид>`; рядок «Конфлікти: N» → `?f=conflict`; порожньо — «Усе розібрано. Нових пропозицій немає.» з посиланнями «Мої рішення» (`/panel/rishennia`) і «Прибрані сторінки» (`/panel/prybrani`); під заголовком — одне речення пояснення; помилка — `panelError` з «Спробувати ще раз»
- [X] T011 [US1] `ReviewQueue.tsx`: фільтр і відкрита пропозиція з адреси (`?f=`, `?id=`) через `useSearchParams` у режимі панелі; у вкладці адміна — як раніше (локальний стан); показ до 50 найстаріших у фільтрі + «Ще N» текстом, якщо більше (Edge Cases)
- [X] T012 [US1] `src/pages/Panel.tsx` рендерить `ReviewQueue` на `/panel/rozbir` і `HiddenAndBans` на `/panel/prybrani`

**Checkpoint**: модератор заходить на `/panel/…` за адресою і бачить чергу.

---

## Phase 4: User Story 2 — Розібрати пропозицію без підказок збоку (P1)

**Goal**: одна пропозиція на одному екрані, автор з історією, перехід до наступної.

**Independent Test**: quickstart, сценарії 4–7.

- [X] T013 [US2] `ProposalView.tsx`: порядок блоків — що змінюється → автор (нік, «прийнято N, відхилено N» з `wiki_contributors` за `id = author`; немає рядка — «перша пропозиція») → джерело й скрін → дії; кнопки «Опублікувати» / «Підправити й опублікувати» / «Відхилити» (розкриває швидкі причини й поле своєї; без причини — «Вибери причину — її побачить автор», запиту немає) / другорядна «Заборонити автору пропонувати»
- [X] T014 [US2] `ProposalView.tsx`, конфлікт: текст «Поки ця правка чекала, картку вже змінили. Нижче — що зміниться поверх нової версії.», кнопка «Опублікувати поверх нової версії»; скрін не відкрився — «Скрін уже прибрано» замість `<img>`
- [X] T015 [US2] `ProposalView.tsx`: помилки рішення — через `panelError`; на `QH012` дочитати `wiki_proposals.decided_by` → нік з `profiles` → «Цю пропозицію вже розібрав <нік>.» і прибрати пропозицію зі списку
- [X] T016 [US2] `ReviewQueue.tsx`: після рішення — `nextProposal(list, id, filter)`; повідомлення «Опубліковано. Залишилось: N» / «Відхилено. Залишилось: N»; `null` → «Усе розібрано» з посиланням на `/panel` (у вкладці адміна — без посилання)
- [X] T017 [US2] `src/styles.css`: розбір — дві колонки (список ліворуч, пропозиція праворуч) від 721 px; до 720 px — або список, або пропозиція на весь екран з кнопкою «← До черги»; рядок дій `position: sticky; bottom: 0` з фоном картки; без горизонтальної прокрутки на 360 px, обидві теми (research R9)

**Checkpoint**: MVP для модераторів — US1 + US2 працюють за прямою адресою.

---

## Phase 5: User Story 3 — Редактор має одне місце для своєї роботи (P2)

**Goal**: «Мої інструменти» для всіх трьох ролей, шапка й переадресації.

**Independent Test**: quickstart, сценарії 1, 10, 11.

- [X] T018 [US3] `PanelHome.tsx`, блок «Мої інструменти»: «Мої чернетки міток» — `map_drafts` `select('status').eq('author', <я>)`, `draftCounts` → «На розгляді: N · Опубліковано: N · Відхилено: N» → `/mapa?tools=drafts`, пояснення «Мітки, які ти поставив у грі клавішею F9. Публікує власник.»; «Межі цін» → `/tsiny`, пояснення «Відкрий товар у скупника — під графіком поля „Мінімум“ і „Максимум“.»; «Івенти» → `/wiki/iventy`, пояснення «Додати чи змінити івент або промокод.» Причини відхилення чернетки немає (research R5)
- [X] T019 [US3] `src/components/Layout.tsx`: для `editor` і `moderator` — одна кнопка «Панель» → `/panel` (замість нинішньої «Модерація» модератора); у модератора — число пропозицій на розгляді, якщо > 0 (той самий легкий запит, що в T010, з `count: 'exact', head: true`); `admin` — «Адмінка» без змін
- [X] T020 [US3] `src/pages/Admin.tsx`: `moderator` → `<Navigate replace>` на `/panel/rozbir`, якщо `tab=wiki`, інакше на `/panel` (замість фільтра вкладок `Admin.tsx:28`); `editor` і `user` — `NotFound`, як зараз; для `admin` у шапці сторінки посилання «Панель модераторів» → `/panel`
- [X] T021 [US3] `src/pages/Panel.tsx`: для `admin` у шапці — посилання «Адмінка» → `/admin`

**Checkpoint**: редактор і модератор потрапляють у панель з шапки; старі закладки працюють.

---

## Phase 6: User Story 4 — Зрозумілі слова замість технічних (P2)

**Goal**: на екранах панелі 0 технічних слів.

**Independent Test**: quickstart, сценарій 13.

- [X] T022 [P] [US4] `src/lib/panelCopy.test.ts`: читає `src/pages/Panel.tsx` і всі `src/components/panel/*.tsx`, бере лише текст у JSX і рядкові літерали з кирилицею (без коментарів та ідентифікаторів), шукає без урахування регістру: `specs/`, `міграц`, `.sql`, `QH0`, `RLS`, `moderator`, `editor`, `admin`, `Supabase` — жодного збігу
- [X] T023 [US4] Пройти тексти панелі: прибрати «міграцію 0057_community_wiki.sql застосовано?» та інші технічні рядки з винесених компонентів (`ReviewQueue`, `HiddenAndBans`, `ProposalView`); кожен розділ — заголовок + одне речення (FR-007); помилки завантаження — `panelError`; T022 зелений

---

## Phase 7: User Story 6 — Розробник не втрачає нічого (P2)

**Goal**: вкладки адміна без змін; модератор/редактор не бачать розробницьких розділів.

**Independent Test**: quickstart, сценарії 11 і 12.

- [X] T024 [US6] Перевірити `src/pages/Admin.tsx` і `AdminWiki.tsx`: 8 вкладок адміна з тими самими назвами й порядком; «Довідник» = `ReviewQueue` + `Hidden` + `Bans` + `Settings`; `npx.cmd tsc --noEmit -p .` зелений

---

## Phase 8: User Story 5 — Модератор бачить свою роботу (P3)

**Goal**: `/panel/rishennia`.

**Independent Test**: quickstart, сценарій 9.

- [X] T025 [US5] `src/components/panel/MyDecisions.tsx`: `wiki_proposals` `.eq('decided_by', <я>)` (`id, section, target_id, kind, status, reason, decided_at, version_id, data->name`) і `wiki_versions` `.eq('decided_by', <я>).in('kind', ['revert','hide','unhide'])`, останні 50 кожного → `mergeDecisions`; рядок: дата, дія людськими словами («Опубліковано», «Опубліковано з правками», «Відхилено: <причина>», «Відкат», «Прибрано», «Повернуто»), розділ, назва — посилання (роботи `/wiki/roboty?job=<id>`, мітки — мапа за координатами, транспорт — без посилання); порожньо — «Ти ще нічого не розбирав.»
- [X] T026 [US5] `src/pages/Panel.tsx`: `/panel/rishennia` → `MyDecisions`; посилання на нього з `PanelHome`

---

## Phase 9: Polish & Cross-Cutting

- [X] T027 `npx.cmd tsc --noEmit -p .`, `npx.cmd vitest run` — усе зелене
- [X] T028 Пройти `specs/061-moderator-panel/quickstart.md` локально (`npx.cmd vite --mode production`) сценарії 1–13; 360 px і обидві теми
- [ ] T029 Власнику: перевірити на живому сайті після злиття, сценарії 4, 10, 12; далі SC-001 і SC-004 з модераторами
- [ ] T030 `docs/PLAN.md`: додати 061 у список зробленого після перевірки власником; `spec.md` Status → Implemented

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** → усі історії.
- **US1 (Phase 3)** → **US2 (Phase 4)**: розбір за адресою потрібен, щоб доробляти екран пропозиції.
- **US3 (Phase 5)** залежить лише від T008 (сторінка `/panel`) — можна після Phase 3 паралельно з US2.
- **US4 (Phase 6)** — після US1–US3 (перевіряє їхні тексти); T022 можна написати раніше.
- **US6 (Phase 7)** — після Phase 2 і T020.
- **US5 (Phase 8)** — після T008, незалежно від US2–US4.

### Parallel Opportunities

- T002 (тести) паралельно з T004–T006 (винесення компонентів) — різні файли.
- Після Phase 3: US2 (T013–T017, файли `ProposalView`/`ReviewQueue`/`styles.css`) ∥ US3 (T018–T021, `PanelHome`/`Layout`/`Admin`) ∥ US5 (T025, `MyDecisions`).
- T022 — у будь-який момент після T001.

### Parallel Example: після Phase 3

```text
Агент A: T013 → T014 → T015 → T016 → T017   (ProposalView, ReviewQueue, styles.css)
Агент B: T018 → T019 → T020 → T021          (PanelHome, Layout, Admin, Panel)
Агент C: T025 → T026                         (MyDecisions)
```

## Implementation Strategy

### MVP

Phase 1 → Phase 2 → US1 → US2. Модератори вже можуть працювати в `/panel/rozbir` за посиланням; шапка ще стара.

### Далі

US3 (шапка, редактори, переадресації) → US4 (тексти) → US6 (перевірка адміна) → US5 (мої рішення) → Polish. Кожен крок — окремий коміт, вкладка адміна після кожного працює.
