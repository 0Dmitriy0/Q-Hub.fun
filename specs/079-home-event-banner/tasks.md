# Tasks: Банер івенту на головній — без блимання, текст на всю ширину

**Input**: Design documents from `specs/079-home-event-banner/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/home-hero.md, quickstart.md

**Tests**: так — конституція, принцип VI (чиста логіка → `vitest`); research R4.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Переконатися, що тести сайту зелені до змін: `npx.cmd vitest run` у корені репо

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: чиста логіка рішення «показати картку / яку» й підказки — нею користуються обидві історії.

- [ ] T002 Створити `src/lib/halloween.ts`: тип `HeroInfo = { ghosts: number; pumpkins: number; ended: boolean }`; тип `HeroKind = 'ghosts' | 'pumpkins' | 'both'`; константа `HERO_HINT_KEY = 'qhub-hero-event'`; функція `eventOn(info)` = `!info.ended && (info.ghosts > 0 || info.pumpkins > 0)` (FR-006, правило без змін); `heroKind(info)` → `'both'` (обидва > 0), `'pumpkins'` (лише гарбузи), `'ghosts'` (інакше); `heroBanner(info: HeroInfo | null, hint: HeroKind | null)` → `HeroKind | null`: є `info` — `eventOn(info) ? heroKind(info) : null`; немає `info` — `hint` (null, якщо підказки немає); `showParam(kind)` → `'pryvydy,harbuzy' | 'harbuzy' | 'pryvydy'`; `parseHint(raw: string | null)` → `HeroKind | null` (будь-що інше, ніж три значення, — null). Коментар українською з посиланням на specs/079
- [ ] T003 [P] Тести `src/lib/halloween.test.ts` (vitest): немає даних і підказки → null (SC-001); немає даних, підказка `ghosts` → `ghosts`; дані «скінчився» (`ended: true`, мітки є) → null навіть з підказкою; 0 привидів і 0 гарбузів → null; лише гарбузи → `pumpkins`, лише привиди → `ghosts`, обидва → `both`; `showParam` для кожного типу; `parseHint('xxx')` → null, `parseHint(null)` → null

**Checkpoint**: `npx.cmd vitest run src/lib/halloween.test.ts` зелений.

---

## Phase 3: User Story 1 — Івенту немає: без блимання, текст на всю ширину (Priority: P1) 🎯 MVP

**Goal**: картка не з'являється, доки невідомо про івент; без картки текст першого екрана на всю ширину.

**Independent Test**: quickstart.md, п. 1–4.

- [ ] T004 [US1] `src/components/HalloweenBanner.tsx`: перейти на функції з `src/lib/halloween.ts`. Початковий стан підказки — синхронно з `localStorage.getItem(HERO_HINT_KEY)` через `parseHint` у `try/catch` (помилка → null). Рендер: `const kind = heroBanner(info, hint); if (!kind) return null;` — тобто поки `info === null` і підказки немає, картки немає (FR-001; research R1). Тексти картки (заголовок, опис, тег), картинку й `to={`/mapa?show=${showParam(kind)}`}` лишити дослівно як зараз для відповідних випадків (FR-007); числа (`plural(...)`) показувати лише коли `info` вже є, а до того — текст з підказки без чисел (для `ghosts` — «Швидко знаходь усіх привидів осіннього оновлення Quant RP.», для `pumpkins`/`both` — без числа: «Гарбузи Хелловіну на Quant RP — усі на мапі Q-Hub.» / «Привиди й гарбузи Хелловіну на Quant RP — усі на мапі Q-Hub.»). Оновити коментар угорі файлу: «поки дані не прийшли — картки немає (specs/079)»
- [ ] T005 [US1] Там само, у `.then(...)` після приходу даних: записати підказку — `eventOn(info) ? localStorage.setItem(HERO_HINT_KEY, heroKind(info)) : localStorage.removeItem(HERO_HINT_KEY)` у `try/catch`; у `.catch` (немає бази) — сховище не чіпати (data-model.md, «Запис»)
- [ ] T006 [US1] `src/styles.css`: `.h-hero` (рядок ~992) — `grid-template-columns: minmax(0, 1fr)` за замовчуванням; нове правило `.h-hero:has(> .h-promo) { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }`; у одноколонковому стані опису дати ширшу межу: `.h-hero:not(:has(> .h-promo)) .h-lead { max-width: 80ch; }` (research R2). Медіазапит `@media (max-width: 1000px) { .h-hero, .h-split { grid-template-columns: 1fr; } }` лишити — він має перекривати і `:has`-правило (перевірити специфічність: за потреби дописати `.h-hero:has(> .h-promo)` у той самий медіазапит)

**Checkpoint**: без івенту — картки немає ні на кадр, текст на всю ширину (quickstart 1–4).

---

## Phase 4: User Story 2 — Івент є: картка праворуч, як раніше (Priority: P2)

**Goal**: під час івенту — двоколонковий перший екран; при повторному візиті без стрибка.

**Independent Test**: quickstart.md, п. 3, 5, 6.

- [ ] T007 [US2] Перевірити в `src/components/HalloweenBanner.tsx`, що з підказкою картка малюється з першого рендера (до даних) і після даних «івент є» лишається на місці (той самий `<Link className="h-promo">`, змінюється лише текст/числа), а після даних «івенту немає» — зникає й підказка видаляється (data-model.md, таблиця переходів). Якщо T004–T005 так і зробили — змін немає
- [ ] T008 [US2] Перевірити в браузері розкладку з карткою: ≥ 1001 px — текст ліворуч `1.5fr`, картка праворуч `1fr`, як до зміни; ≤ 1000 px — картка під текстом (contracts/home-hero.md). Для перевірки без івенту — вручну поставити `localStorage['qhub-hero-event'] = 'ghosts'` і подивитись перший кадр

**Checkpoint**: обидві історії працюють незалежно.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T009 Усі тести сайту й типи: `npx.cmd vitest run` і `npx.cmd tsc --noEmit -p .` — зелені
- [ ] T010 Збірка `npm.cmd run build` проходить; `dist/_p/index.html` (статична копія головної) — як і раніше без картки
- [ ] T011 Перевірка в браузері за `specs/079-home-event-banner/quickstart.md` п. 1–4 і 6 на дев-сервері `npx.cmd vite --mode production`; скріншоти 1440 px і 390 px без івенту
- [ ] T012 Журнали: зміна лише сайту й нічого нового для гравця — `src/data/changelog.json` і `src/data/sitenews.json` НЕ змінювати (spec, Assumptions; пам'ять `changelog-program-only`)

---

## Dependencies & Execution Order

- T001 → T002 → (T003 ∥ T004) → T005 → T006 → T007 → T008 → T009–T011 → T012
- T004/T005 — один файл, по черзі; T006 — інший файл, можна паралельно з T004 після T002.
- US2 спирається на T004–T006 і лише перевіряється.

## Parallel Example

```text
Після T002:  T003 (src/lib/halloween.test.ts)  ∥  T004 (HalloweenBanner.tsx)  ∥  T006 (styles.css)
Polish:      T009 ∥ T010
```

## Implementation Strategy

- **MVP**: T001–T006 — блимання зникає, текст на всю ширину (головна скарга).
- US2 (T007–T008) — перевірка, що під час івенту все як було, плюс без стрибка при повторному візиті.
- Деплой — злиттям у `main` (сайт виходить одразу; паки стосуються лише програми).
