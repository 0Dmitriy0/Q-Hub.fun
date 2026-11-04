# Tasks: Івенти у WIKI — плитки, сторінка івенту й мапа з мітками

**Input**: Design documents from `specs/055-wiki-events/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/events-ui.md, quickstart.md

**Tests**: обов'язкові за конституцією, принцип VI — SQL-тест на зміну прав, модульні тести на чисту логіку (`vitest`).

**Organization**: задачі згруповано за історіями зі spec.md: US1 плитки (P1), US2 сторінка й мапа (P1), US3 батл пас
(P2), US4 внесення staff (P2). У WIKI — лише сезонні й особливі івенти; щоденні за розкладом (`src/lib/events.ts`) не
чіпаємо.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можна робити паралельно (інші файли, немає залежностей від незавершених задач)
- **[Story]**: US1 / US2 / US3 / US4

---

## Phase 1: Setup

- [X] T001 Перевірити, що номер міграції `0051` вільний у `main` і в гілках `origin/*` (`0050` зайнята `claude/fervent-lamport-cg3ldl`); якщо зайнятий — узяти наступний вільний і замінити номер у `plan.md`, `data-model.md`, `quickstart.md` і задачах нижче
- [X] T002 Перевірити на робочій базі (пам'ять prod-migrations-gaps), що 0025, 0034 і 0033 застосовані: `season_events.ends_on` допускає null, `map_categories` має `grp = 'Івенти'` для `harbuzy`; якщо ні — спершу докотити пропущене

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: схема бази, права й тип на сайті — потрібні всім історіям.

**⚠️ CRITICAL**: жодна історія не починається до завершення цієї фази.

### Тести (спершу, мають падати)

- [X] T003 [P] SQL-тест прав у `supabase/tests/season_events_wiki_test.sql` (шаблон — `supabase/tests/guides_test.sql`: `auth.users` + `profiles.role`, `set role anon|authenticated`, `request.jwt.claim.sub`): `anon` і `user` читають `season_events`, `season_event_maps`, `season_event_levels`, але insert / update / delete у них не проходять; `editor`, `moderator`, `admin` пишуть усі три таблиці; check відхиляють `slug` не за `^[a-z0-9-]{2,60}$`, дубль `slug`, `kind` поза `('event','battlepass')`, `image_url` не `''` і не `https://…`, `body` > 20 000, `prev_id = id`, `level` поза 1–500, `line` поза `('free','paid')`, `reward` порожній чи > 200; видалення івенту каскадно прибирає його `season_event_maps` і `season_event_levels`; видалення категорії мапи прибирає прив'язку; наявний рядок `season_events`, вставлений до міграції, має `slug = 'event-<id>'`; storage: `editor` вставляє об'єкт `catalog/events/1.webp`, але не `catalog/items/1.webp`; `user` — жодного. Додати `$P -f supabase/tests/season_events_wiki_test.sql` у `supabase/tests/run.sh`
- [X] T004 [P] Модульні тести в `src/lib/eventsWiki.test.ts` (сьогодні — фіксоване `'2026-11-04'`): `arrange()` — івент, що триває й закінчується 06.11, вище за той, що до 30.11; без дати кінця — після тих, що з кінцем; «Скоро» — за днями до початку; «Завершився» — новіші вище; батл пас, що триває, іде в `banner` і не потрапляє в `now`; два батл паси, що тривають, — у банер той, що закінчується раніше, другий — серед плиток; завершений батл пас — у `past`, банера немає; `filter(rows, 'past')` лишає лише завершені, без фільтра — усе, крім завершених; `lastDays(ph)` дає `3` при `left = 3` і `null` при `left = 4` чи без кінця; `suggestSlug('Хелловін', ['haloviin'], 2026)` → `'haloviin-2026'`, без конфлікту → `slugify(title)`; `levelsFromText('1; 500 $; free\n2; Кейс; paid')` дає два рядки, рядок з поганим рівнем чи лінією — помилка з номером рядка

### Реалізація

- [X] T005 Міграція `supabase/migrations/0051_season_events_wiki.sql` (ідемпотентна, `if not exists`, `drop policy if exists`, повторний запуск без помилок): у `public.season_events` додати `slug text` (заповнити наявним `'event-' || id`, потім `not null`, `unique`, check `slug ~ '^[a-z0-9-]{2,60}$'`), `kind text not null default 'event' check (kind in ('event','battlepass'))`, `image_url text not null default '' check (image_url = '' or image_url ~ '^https://')`, `body text not null default '' check (char_length(body) <= 20000)`, `prev_id bigint references public.season_events (id) on delete set null` з check `prev_id is null or prev_id <> id`; таблиця `public.season_event_maps (event_id bigint not null references public.season_events (id) on delete cascade, category_id text not null references public.map_categories (id) on delete cascade on update cascade, primary key (event_id, category_id))`; таблиця `public.season_event_levels (event_id bigint not null references public.season_events (id) on delete cascade, level integer not null check (level between 1 and 500), line text not null default 'free' check (line in ('free','paid')), reward text not null check (char_length(reward) between 1 and 200), primary key (event_id, level, line))`; RLS обох нових таблиць: select для всіх, all для `public.is_staff()`; storage: політики `catalog: staff events upload|update|delete` на `storage.objects` для `bucket_id = 'catalog' and name like 'events/%' and public.is_staff()` (наявні admin-політики 0006 не чіпати); `grant select` на нові таблиці для `anon, authenticated`
- [X] T006 [P] Розширити тип `SeasonEvent` у `src/lib/seasons.ts` полями `slug: string; kind: 'event' | 'battlepass'; image_url: string; body: string; prev_id: number | null` і додати тип `EventLevel { event_id: number; level: number; line: 'free' | 'paid'; reward: string }`; логіку `phase` / `range` / `upcoming` не змінювати
- [X] T007 Чисті функції в `src/lib/eventsWiki.ts` за research R6, R9, R10, щоб пройшов T004: `arrange(rows, today)` → `{ banner, now, soon, past }` (кожен елемент з `ph: Phase`), `filter(rows, f: 'all' | 'now' | 'soon' | 'past')`, `lastDays(ph)`, `suggestSlug(title, taken, year)` (через `slugify` з `src/lib/mapData.ts`), `levelsFromText(text)` → `{ rows, error }`, `mapLink(categoryIds)` → `'/mapa?show=' + ids.join(',')`

**Checkpoint**: T003 і T004 зелені; `npx.cmd vitest run src/lib` без нових падінь.

---

## Phase 3: User Story 1 — Побачити, які івенти зараз ідуть (Priority: P1) 🎯 MVP

**Goal**: вкладка WIKI «Івенти» з плитками й фільтром.

**Independent Test**: внести два івенти (один триває, один завершився), відкрити `/wiki/iventy`: в обох фото, назва,
короткий опис і дати; той, що триває, першим з «Триває»; завершений — лише у фільтрі «Архів».

- [ ] T008 [US1] Маршрути в `src/App.tsx`: у `<Route path="wiki">` додати `iventy` → `WikiEvents` і `iventy/:slug` → `WikiEvent` (lazy, як інші сторінки); `path="iventy"` верхнього рівня змінити з `<Navigate to="/" />` на `<ToWiki to="/wiki/iventy" />`
- [ ] T009 [US1] Третя вкладка в `src/pages/Wiki.tsx`: `NavLink to="/wiki/iventy"` з іконкою (наявна `Icon`, напр. `calendar` чи `star` — узяти ту, що є в `src/components/Icon.tsx`) і лічильником тих, що тривають (запит `season_events` `starts_on,ends_on` → `phase()`; 0 не показувати); `here` і хлібні крихти — «Івенти» для `/wiki/iventy*`
- [ ] T010 [US1] Сторінка `src/pages/WikiEvents.tsx`: завантажити `season_events` (`id,slug,kind,title,description,image_url,starts_on,ends_on`) і кількість міток на івент (`season_event_maps` → `map_points` count за категоріями); `arrange()` з `kyivDay(Date.now())`; плитки за `contracts/events-ui.md` → «Плитка»: фото 16:9 або заглушка, позначка стану («Триває» / «Скоро · через N дн.» / «Завершився», ≤ 3 днів — «Ще N дн.»), назва в 1 рядок, опис до 3 рядків, дати `range()` або «до оголошення», «Мапа · N» лише якщо є; плитка — `Link` на `/wiki/iventy/<slug>`; фільтр «Усі · Тривають · Скоро · Архів» сегментованими кнопками, стан у `?f=`; порожньо — «Івентів ще немає»; без бази — як у `Transport.tsx` («База ще не підключена»)
- [ ] T011 [P] [US1] Стилі в `src/styles.css`: сітка плиток (1 колонка на 375 px, 2 — від 720, 3 — від 1080), фото 16:9 з `object-fit: cover`, обрізка опису `-webkit-line-clamp: 3`, позначки стану в наявних кольорах теми (світла й темна), без горизонтального скролу

**Checkpoint**: сценарії 1, 2, 11, 12 з `quickstart.md`.

---

## Phase 4: User Story 2 — Прочитати про івент і знайти локації на мапі (Priority: P1)

**Goal**: сторінка івенту з повним описом, міні-мапою й переходом на велику мапу.

**Independent Test**: прив'язати до Хелловіну категорію `harbuzy`, відкрити сторінку: на міні-мапі стільки ж міток, скільки
на великій; «Відкрити на великій мапі» → `/mapa?show=harbuzy` лише з гарбузами.

- [ ] T012 [US2] Міні-мапа `src/components/EventMap.tsx`: проп `categoryIds: string[]`; монтувати Leaflet лише коли блок видно (IntersectionObserver); `baseMap(el, { zoomControl: true, attributionControl: false })` і `pinIcon(cat, mark.icon)` з `src/lib/mapMarks.ts`; мітки — `loadMapData()`, фільтр `marks.filter(m => categoryIds.includes(m.category))`; кадр `fitBounds` на всі мітки один раз; повертати кількість міток через `onCount(n)`; прибирати карту при розмонтуванні
- [ ] T013 [US2] Сторінка `src/pages/WikiEvent.tsx` за `contracts/events-ui.md` → «Сторінка івенту»: `useParams().slug` → рядок `season_events` (`maybeSingle`); «← Усі івенти»; фото, тип, назва, стан `phase()`, дати; повний опис через `steps()` з `src/lib/guide.ts` (абзаци, `Знімок: https://…` — картинка), порожній `body` — показати `description`; блок мапи лише якщо є `season_event_maps`: «N локацій», `EventMap`, кнопка «Відкрити на великій мапі» → `mapLink(ids)`; «Минулого разу» → сторінка `prev_id` (запит slug), якщо є; немає такого slug — «Такого івенту немає» + «Усі івенти»; `document.title` — назва івенту
- [ ] T014 [US2] Блок на головній `src/components/EventsBlock.tsx`: запит `season_events` доповнити `slug`; назва сезонного івенту стає `Link` на `/wiki/iventy/<slug>` (наявне зовнішнє `link` лишається окремою кнопкою); щоденний «Розклад» не чіпати
- [ ] T015 [P] [US2] Стилі сторінки в `src/styles.css`: шапка з фото, текст з обмеженою шириною рядка, блок мапи висотою 360 px (260 px на 375), кнопка під мапою на всю ширину на телефоні

**Checkpoint**: сценарії 4–8 з `quickstart.md`.

---

## Phase 5: User Story 3 — Батл пас (Priority: P2)

**Goal**: поточний батл пас — широкий банер над плитками; на сторінці — таблиця рівнів і нагород.

**Independent Test**: внести батл пас, що триває, з 3 рівнями: над плитками банер з «Ще N дн.», серед плиток його немає;
на сторінці таблиця «Рівень · Безкоштовно · Платно».

- [ ] T016 [US3] Банер у `src/pages/WikiEvents.tsx` з `arrange().banner` за `contracts/events-ui.md` → «Банер батл пасу»: фото на всю ширину, «Батл пас», назва, дати, «Ще N дн.», кнопка «Нагороди й квести» → сторінка; немає — нічого
- [ ] T017 [US3] Таблиця рівнів у `src/pages/WikiEvent.tsx` для `kind = 'battlepass'`: запит `season_event_levels` за `event_id`, рядки за `level`, колонки «Рівень · Безкоштовно · Платно» (колонка «Платно» лише якщо є `line = 'paid'`); рівнів немає — «Нагороди ще не внесено»
- [ ] T018 [P] [US3] Стилі банера й таблиці в `src/styles.css`: банер 21:9 (16:9 на телефоні) з затемненням під текстом для контрасту ≥ 4.5:1; таблиця з горизонтальним скролом лише всередині блоку на 375 px

**Checkpoint**: сценарій 3 з `quickstart.md`.

---

## Phase 6: User Story 4 — Внести й оновити івент (Priority: P2)

**Goal**: staff (`admin`, `editor`, `moderator`) додає й змінює івент з фото, описом, прив'язкою до мапи й рівнями.

**Independent Test**: акаунтом `editor` додати івент з фото й категорією `harbuzy` — плитка з фото з'являється, на сторінці
мапа; акаунтом `user` форми немає, запис в обхід інтерфейсу відхиляє база (T003).

- [ ] T019 [US4] Форма `src/components/EventForm.tsx` за `contracts/events-ui.md` → «Форма staff»: назва (1–80), адреса (`suggestSlug`, правило `^[a-z0-9-]{2,60}$`), тип, дата початку, дата кінця (необов'язково, ≥ початку), короткий опис (≤ 600), повний опис (≤ 20 000), посилання (`https://` або порожньо), фото через `PicUpload` (`path: events/<id>.webp`, `frame: { w: 640, h: 360 }`; для нового івенту — після першого збереження), категорії мапи — чекбокси з категорій `grp = 'Івенти'` з кількістю міток (зберігати як повний набір рядків `season_event_maps`: видалити зняті, вставити нові), «Минулого разу» — вибір з інших івентів, рівні батл пасу — текстове поле `рівень; нагорода; free|paid` через `levelsFromText` (помилка з номером рядка біля поля; зберігати як повну заміну рядків); помилки бази — біля форми, без втрати введеного
- [ ] T020 [US4] Підключити форму: кнопка «Додати івент» у `src/pages/WikiEvents.tsx` і «Змінити» / «Видалити» (з підтвердженням з назвою івенту) у `src/pages/WikiEvent.tsx` — лише для `role in ('editor','moderator','admin')` з `useAuth()`; у `src/components/EventsBlock.tsx` замінити `SeasonForm` на `EventForm`, щоб на головній і у WIKI була одна форма
- [ ] T021 [US4] Після збереження чи видалення — перечитати список / сторінку; зміна `slug` у формі на сторінці — перехід на нову адресу (`navigate(..., { replace: true })`)

**Checkpoint**: сценарії 9 і 10 з `quickstart.md`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Перевірити доступність (скіл `a11y-enforcer`): плитки й банер — посилання з видимим фокусом, `alt` на фото (назва івенту), фільтр — `aria-pressed`, контраст позначок стану в обох темах
- [ ] T023 [P] Оновити `docs/PLAN.md`: пункт 055 «Архів івентів» → зроблено (specs/055), примітка «щоденні за розкладом — у вкладці "Розклад" на головній»
- [ ] T024 Прогнати всі тести: `npx.cmd vitest run` і `npx.cmd tsc --noEmit` (або наявна збірка `npm.cmd run build`); SQL — у CI PR (`supabase/tests/run.sh`)
- [ ] T025 Пройти `quickstart.md` (сценарії 1–12) на `npx.cmd vite --mode production`, ширини 375 і 1280 px
- [ ] T026 Застосувати `0051` на робочій базі (вручну, SQL Editor) після злиття; перевірити публічним API, що `season_events` віддає `slug`, а `season_event_maps` читається гостем; внести Хелловін і осінній батл пас (фото, опис, `harbuzy`, рівні)

`changelog.json` не змінювати: WIKI лише на сайті (пам'ять «Журнал — лише про програму»).

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** → історії.
- **US1 (Phase 3)** — після Phase 2; MVP.
- **US2 (Phase 4)** — після T008 (маршрути); від US1 не залежить, але плитки ведуть на сторінку, тож зручно після US1.
- **US3 (Phase 5)** — T016 після T010, T017 після T013.
- **US4 (Phase 6)** — після T010 і T013 (кнопки на цих сторінках); дані для перевірки US1–US3 до того можна внести SQL-ом.
- **Phase 7** — після потрібних історій; T026 — лише після злиття в `main`.

### Parallel Opportunities

- T003 ∥ T004 (SQL і vitest); T006 ∥ T005.
- Стилі T011, T015, T018 — паралельно з розміткою своїх історій.
- T012 (EventMap) ∥ T010 (WikiEvents).
- T022 ∥ T023.

```text
# Phase 2 разом:
T003 supabase/tests/season_events_wiki_test.sql
T004 src/lib/eventsWiki.test.ts
T006 src/lib/seasons.ts
# Phase 3–4 разом:
T010 src/pages/WikiEvents.tsx   ∥   T012 src/components/EventMap.tsx
```

## Implementation Strategy

1. **MVP (часу мало — Хелловін іде зараз)**: Phase 1–2 → US1 → US2 → застосувати 0051 і внести Хелловін SQL-ом. Це вже
   дає вкладку, сторінку й мапу гарбузів.
2. **Далі**: US3 (банер і рівні батл пасу) → US4 (форма для staff, замість SQL).
3. Кожна історія — окрема перевірка за `quickstart.md`; злиття в `main` — після зелених тестів (CI).
