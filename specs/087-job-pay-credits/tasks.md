---
description: "Task list: Хто й коли заміряв заробіток роботи"
---

# Tasks: Хто й коли заміряв заробіток роботи

**Input**: `specs/087-job-pay-credits/` — plan.md, spec.md, research.md, data-model.md, contracts/pay-credits.md, quickstart.md

**Tests**: так — конституція, принцип VI: чиста логіка MUST мати модульні тести (`vitest`). SQL-тестів не треба — правила доступу не змінюються.

**Organization**: US1 (P1), US2 (P2), US3 (P2).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Переконатися, що `npm.cmd test` у корені зелений до змін (база)

---

## Phase 2: Foundational

**Мета**: чиста логіка розбиття заробітку й пошуку автора частини — потрібна всім історіям.

- [X] T002 Написати тести `src/lib/payCredits.test.ts` (спершу червоні) за contracts/pay-credits.md і data-model.md: `splitPay` — «Роздільник частин — ` · ` чи новий рядок; порожні частини відкидаються», trim; `partKey` — «до першої «:» у перших 40 знаках (нижній регістр, trim), інакше весь текст»; `payCredits`: «Версії обробляються за зростанням `version_no`; `hide`/`unhide` пропускаються» (вхід у будь-якому порядку); частина отримує кредит версії, де її текст став теперішнім; зміна іншої частини не міняє кредит; заміна частини — новий кредит; «текст, що повернувся до вже баченого для цього ключа, бере кредит першої появи» (відкат); `seed` → `kind 'seed'`, `at null`; `accept` → `kind 'proposal'`, `by = author`, `approvedBy = decided_by`, але `approvedBy null`, якщо `decided_by === author`; `admin` → `kind 'admin'`, `by = decided_by ?? author`; `stale` — «`at` null чи старше 30 днів від `now`»; «`pay` останньої версії ≠ теперішній `job.pay` → результат порожній»; «Порожній `pay` → порожній результат»; порядок результату — як частини в `currentPay`; не кидає винятків на сміттєвому вході
- [X] T003 Створити `src/lib/payCredits.ts`: типи `PayVersion`, `PayPart`, функції `splitPay`, `partKey`, `payCredits(versions, currentPay, now = Date.now())`, `STALE_DAYS = 30` (коментарі українською, specs/087); довести T002 до зеленого

**Checkpoint**: `payCredits.test.ts` зелений.

---

## Phase 3: User Story 1 — Хто й коли заміряв кожну частину (P1) 🎯 MVP

**Goal**: під кожною частиною заробітку — «Заміряв … · дата · підтвердив …».

**Independent Test**: пропозиція заробітку від гравця А, опублікована модератором Б → під частиною «Заміряв А · <дата> · підтвердив Б» (quickstart §2.1).

- [X] T004 [US1] Компонент `src/components/wiki/PayBlock.tsx` ({ section 'job', target: job.id, pay: job.pay }): одразу малює частини `splitPay(pay)` окремими рядками (FR-001, текст без очікування — FR-008); якщо є `supabase` — один запит `supabase.from('wiki_versions').select('version_no,kind,author,decided_by,created_at,data').eq('section','job').eq('target_id', target).order('version_no', { ascending: true }).limit(200)` → `payCredits(versions.map(v => ({ ...v, pay: v.data?.pay ?? '' })), pay)`; імена — `loadNames()` з `src/components/wiki/PageMeta.tsx`; без `supabase` чи з помилкою — лише текст (FR-009); скасування запиту при закритті/зміні роботи (прапорець `alive`)
- [X] T005 [US1] Підпис частини в `PayBlock.tsx` за таблицею contracts/pay-credits.md: `proposal` → «Заміряв <ім'я> · <дата>» + « · підтвердив <ім'я>», якщо `approvedBy`; `admin` → «Додав <ім'я> · <дата>»; `seed` → «З початкових даних довідника»; немає імені — «гравець» (автор) / «модератор» (підтвердив) (FR-006); дата — `toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })` + рік, якщо не поточний (FR-007)
- [X] T006 [US1] У `src/components/JobDialog.tsx:77` замінити `<p className="jd-text">{job.pay}</p>` на `<PayBlock target={job.id} pay={job.pay} />`; примітку «Суми — з тестів гравців…» лишити під блоком
- [X] T007 [P] [US1] Стилі в `src/styles.css` поруч з `.jd-text`: `.jd-pay` (список без маркерів, відступ між частинами 8px), `.jd-pay-part` (текст як `.jd-text`), `.jd-pay-by` (12.5px, `--muted`, з'являється без зсуву — `min-height` рядка підпису), `overflow-wrap: anywhere` (без горизонтальної прокрутки на 375 px)

**Checkpoint**: US1 працює на сайті.

---

## Phase 4: User Story 2 — Свіжість цифри (P2)

**Goal**: частина старша за 30 днів — позначка «давно не перевіряли».

**Independent Test**: частина з датою > 30 днів тому — позначка є; від сьогодні — немає (quickstart §2.3).

- [X] T008 [US2] У `PayBlock.tsx` для `stale` — позначка «давно не перевіряли — заміряй таймером Q-Hub і запропонуй свіжу» поруч із підписом (FR-005); стиль `.jd-pay-stale` у `src/styles.css` (тон `--warn`/жовтий як інші попередження сайту, контраст ≥ 4,5 : 1)

---

## Phase 5: User Story 3 — Заробіток одним рядком (P2)

**Goal**: старий заробіток без частин — хто й коли востаннє змінив саме заробіток або «З початкових даних довідника».

**Independent Test**: робота з початковим заробітком → «З початкових даних довідника»; змінений одним рядком гравцем В → «Заміряв В · <дата>» (quickstart §2.2).

- [X] T009 [US3] Перевірити й за потреби доповнити тестом у `src/lib/payCredits.test.ts`: `pay` без двокрапки — одна частина з ключем = весь текст; будь-яка зміна тексту дає новий кредит, а зміна інших полів роботи (версія з тим самим `pay`) — ні
- [X] T010 [US3] У `PayBlock.tsx` — частина без двокрапки показується так само з підписом (окремого шляху не потрібно, якщо T009 зелений); перевірити на роботі з заробітком із початкових даних

---

## Phase 6: Polish & Cross-Cutting

- [X] T011 [P] Запис у `src/data/sitenews.json` (зміна лише сайту — пам'ять «Новини сайту — sitenews.json»): якщо верхній запис ще не в `main` — дописати в нього, інакше новий `id` `2026-11-14.2` (чи поточна дата); група `added`, мовою гравця: «У довіднику робіт біля заробітку видно, хто заміряв цифру, коли і хто з модераторів підтвердив; старі цифри позначені «давно не перевіряли»»
- [X] T012 Прогнати `npm.cmd test` і `npx.cmd tsc --noEmit`; виправити червоне
- [X] T013 Перевірити наживо (`npx.cmd vite --mode production`, безголовий Edge 375 і 1280 px, як у specs/085): «Фермер» з частинами, робота з початковим заробітком, «Історія змін» збігається з підписами (SC-002); знімки в scratchpad

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (T002 → T003) → US1 (T004–T007) → US2 (T008) і US3 (T009–T010) → Polish.
- US2 і US3 незалежні між собою; обидві правлять `PayBlock.tsx` — по черзі.

## Parallel Opportunities

- T007 (CSS) ∥ T004–T005 (компонент).
- T011 (sitenews) ∥ будь-що після T003.

## Implementation Strategy

MVP — US1 (T001–T007); US2 й US3 — по одній-двох задачах, разом з MVP за один підхід. Злиття в `main` викладає сайт (деплой — GitHub Actions), тож лише за командою власника.
