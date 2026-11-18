---

description: "Task list: Глосарій RP-термінів у пошуку по правилах"
---

# Tasks: Глосарій RP-термінів у пошуку по правилах

**Input**: `specs/093-rp-glossary/` — plan.md, spec.md, research.md, data-model.md, contracts/glossary.md, quickstart.md

**Tests**: обов'язкові (вимога власника в `/speckit-plan` і конституція, принцип VI): vitest на кожен термін і на «33» vs «зз»; SQL-тест прав і версій.

**Organization**: US1 (розширення запиту) і US2 (картка) — P1, MVP: працюють у плашці з вбудованим `glossary.json`, ще без бази. US3 (керування командою, завантаження з бази) — P2. US4 (сторінка «Глосарій») — P3.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Конституція 1.3.0 → 1.4.0 у `.specify/memory/constitution.md`: у принципі II до винятку довідника додати пункт «Глосарій RP-термінів (specs/093): терміни додають, змінюють і прибирають `admin` і `moderator` напряму; кожна зміна лишає версію з автором і часом, відкат можливий». Оновити Sync Impact Report (версія, дата 2026-11-18, MINOR, погоджено власником 2026-11-18) і рядок `Version / Last Amended`
- [X] T002 Закомітити `specs/093-rp-glossary/` і конституцію в гілку `093-rp-glossary`

---

## Phase 2: Foundational (блокує всі історії)

- [X] T003 `src/data/glossary.json` у форматі data-model: `{ "terms": [ { term, aliases[], full_name, description, related_rules[] } ] }`. Терміни (пояснення — з опису власника, коротко, ≤ 300 символів):
  - ДМ (DM, DeathMatch, дезматч, вбивство без причини) — вбивство без RP-причини;
  - ДБ (DB, DriveBy, драйвбай) — вбивство з машини або машиною;
  - СК (SK, Spawn Kill, спавн кіл) — вбивство на місці спавну;
  - ТК (TK, Team Kill) — вбивство своїх; ТК (Трудовий кодекс; full_name «Трудовий кодекс») — окремий запис;
  - РП (RP, Role Play, RolePlay, рольова гра) — гра за ролями;
  - МГ (MG, MetaGaming, метагеймінг) — використання OOC-інформації в IC;
  - ГМ (GM, God Mode, годмод) — поведінка як у режимі бога;
  - ПГ (PG, PowerGaming, павергеймінг) — нереалістичне геройство;
  - РК (RK, Revenge Kill, ревендж, помста) — повернення на місце смерті, помста;
  - БХ (BH, Bunny Hop, банніхоп) — nonRP біг зі стрибками;
  - КК (Кримінальний кодекс); АК (Адміністративний кодекс); ПДР / ДК (Дорожній кодекс; один запис ДК з aliases ПДР); ПК (Процесуальний кодекс);
  - ЗЗ (GZ, Green Zone, зелена зона) — мерія, вокзали, лікарні; стрільба заборонена;
  - НРД (NRD, NonRP Drive) — нереалістична їзда; Деморган (demorgan) — покарання адміністрацією; Ганбан (gunban) — заборона зброї; Варн (warn) — попередження адміністрації.

  `related_rules` — лише там, де у вбудованій `src/data/rules.json` є однозначний пункт (перевірити пошуком: DM → пункт «Заборонено DM (DeathMatch)» Загальних правил, PG, MG, RK, TK, SK, DB — аналогічно); формат «<скорочення документа з abbrsOf> <номер>», напр. «ЗП 6.9»
- [X] T004 Міграція `supabase/migrations/0080_glossary.sql` за data-model:
  - `glossary_terms`: `id uuid pk default gen_random_uuid()`; `term text not null check (char_length(btrim(term)) between 1 and 12)`; `aliases text[] not null default '{}' check (cardinality(aliases) <= 20)`; `full_name text not null default '' check (char_length(full_name) <= 80)`; `description text not null check (char_length(btrim(description)) between 1 and 300)`; `related_rules text[] not null default '{}' check (cardinality(related_rules) <= 10)`; `hidden boolean not null default false`; `version int not null default 1`; `updated_by uuid references profiles on delete set null`; `updated_at timestamptz not null default now()`;
  - `glossary_versions`: `id bigint identity pk`; `term_id uuid not null references glossary_terms on delete cascade`; `version_no int not null`; `action text not null check (action in ('create','edit','hide','unhide','revert'))`; `data jsonb not null`; `author uuid references profiles on delete set null`; `created_at timestamptz not null default now()`; `unique (term_id, version_no)`;
  - RLS: terms `select using (not hidden or public.is_wiki_mod())`; versions `select using (public.is_wiki_mod())`; жодних політик на запис;
  - функція `glossary_names_conflict(p_id, p_term, p_names text[], p_full_name)` — повертає `term` іншого не схованого терміну, у якого збігається будь-яка назва (lower, btrim), крім випадку «однаковий term і різні непорожні full_name»;
  - RPC за contracts/glossary.md: `glossary_save`, `glossary_hide`, `glossary_unhide`, `glossary_revert` — `security definer set search_path = ''`, `is_wiki_mod()` → `42501`; поля: кожен alias 1–80 символів, кожен related_rules ≤ 40 → `22023` з текстом, що не так; конфлікт назви → `23505` «Назва «X» уже є в терміні «Y»»; кожна дія — `version + 1` і рядок `glossary_versions` зі знімком після дії; `revert` бере `data` вказаної версії; `revoke … from public, anon; grant execute … to authenticated`;
  - початковий список з T003 — `insert … where not exists (select 1 from glossary_terms where lower(term)=… and full_name=…)` + рядок версії `create` для кожного; файл ідемпотентний
- [X] T005 [P] SQL-тест `supabase/tests/glossary_test.sql` (uuid `…0093a1`–`…0093a5`: user, editor, moderator, admin, ще один admin):
  - гість читає ДМ; `user`, `editor` → `42501` на кожну RPC і не бачать версій;
  - `moderator` створює «ТСТ», змінює пояснення (версія 2), ховає (гість не бачить), повертає, відкочує до версії 1 (пояснення як було, версія 5 з `revert`);
  - дубль назви «DM» у новому терміні → `23505`; «ТК» з `full_name` «Тестовий кодекс» — дозволено; пояснення 301 символ → `22023`/`check_violation`;
  - прибрати за собою; додати рядок у `supabase/tests/run.sh` після `notifications_test.sql`
- [X] T006 [P] `src/lib/glossary.test.ts` (vitest): терміни `src/data/glossary.json` (term + full_name) збігаються з початковими рядками в `supabase/migrations/0080_glossary.sql` (читати через `import.meta.glob('…?raw')`, пам'ять `tests-no-node-fs`); у кожного терміну непорожні `term` і `description`, `description.length ≤ 300`

**Checkpoint**: дані й права готові; `npm.cmd test` і SQL-тест зелені.

---

## Phase 3: User Story 1 — Скорочення знаходить пункти за будь-якою назвою (P1) 🎯 MVP

**Goal**: «дм», «DM», «lv», «DeathMatch» → ті самі пункти; «33» — номер, «зз»/«pp» — зелена зона.

**Independent Test**: `npx.cmd vitest run src/desktop/rulesSearch.test.ts` — блок «глосарій» зелений, наявні тести без змін.

- [X] T007 [US1] Тести спершу в `src/desktop/rulesSearch.test.ts`, `describe('глосарій у пошуку (specs/093)')` з `G = glossary.json.terms` і `t = RULES.topics`:
  - для **кожного** терміну з `related_rules` або з пунктами в правилах (усі, крім ГМ і БХ): `searchRules(t, term, 8, G)`, `searchRules(t, aliases[0], 8, G)` і `fixedSearch(<term у не тій розкладці>, …)` — ≥ 1 пункт (цикл по `G`, назва терміну в повідомленні assert);
  - ГМ, БХ: `searchRules(t, 'гм', 8, G)` → 0 пунктів;
  - «дм», «DM», «Дм», «DeathMatch» → перший пункт однаковий і це пункт з `related_rules` ДМ;
  - синонім: пункт, що містить «вбивство … без … причини», знаходиться за «дм»;
  - «33» → усі результати мають `n === '33'` (або порожньо, якщо пункту 33 немає), жодного пункту про зелені зони; «зз» і «pp» (`fixedSearch`) → ≥ 1 пункт зі словом «зелен»;
  - «дм у зз» → є пункти обох термінів;
  - без глосарію (`G` не передано) результати наявних тестів не змінюються (SC-005)
- [X] T008 [US1] `src/desktop/rulesSearch.ts`: тип `GlossaryTerm`; `searchRules(topics, query, limit = 8, glossary: GlossaryTerm[] = [])`:
  - після `normalizeQuery` знайти терміни у словах запиту (окреме слово, без регістру; фраза-назва — підпослідовність слів; слово з цифри — ніколи);
  - слово-термін → група варіантів: основи всіх однослівних назв + наявні `ALIAS`; багатослівні назви — фрази (пункт підходить, коли всі слова фрази є за основою) — розширити `match`/`has`/`fits` для фраз;
  - `relatedHits(topics, term)`: `related_rules` «<скорочення> <номер>» → документ за `abbrsOf` + пункт за `n`; ці пункти — першими (бонус до score), не знайдене — пропуск;
  - `knownRuleWord(topics, w, glossary = [])` — будь-яка назва терміну теж відома
- [X] T009 [US1] Скопіювати `src/desktop/rulesSearch.ts` у `supabase/functions/assistant/rulesSearch.ts` (2 рядки шапки копії + оригінал), щоб тест копії лишився зеленим

---

## Phase 4: User Story 2 — Картка терміну над результатами (P1)

**Goal**: над результатами — картка: скорочення, назви, пояснення; без пунктів — «Окремого пункту в правилах немає».

**Independent Test**: vitest `glossaryMatches`; у плашці «пг» → картка ПГ над пунктами.

- [X] T010 [P] [US2] Тести в `src/desktop/rulesSearch.test.ts`: `glossaryMatches(G, 'дм у зз')` → [ДМ, ЗЗ] у порядку слів; `'тк'` → два терміни ТК; `'33'` → []; `'вбивство в лікарні'` → []; повтор терміну («дм dm») — один раз
- [X] T011 [US2] `src/desktop/rulesSearch.ts`: `glossaryMatches(glossary, query)` за contracts
- [X] T012 [P] [US2] `src/desktop/barParts.tsx`: `GlossaryCard({ term, empty })` — `<div className="bterm">`: `<b>{term}</b>` + `aliases` через кому + `full_name` (якщо не повторює aliases) + пояснення; якщо `empty` — `<small>Окремого пункту в правилах немає</small>`; стилі `.bterm` у `src/desktop/bar.css` (рамка як у `.brule`, акцентна смужка зліва)
- [X] T013 [US2] `src/desktop/Bar.tsx`: стан `glossary` (поки — `glossary.json`, у US3 замінити на `loadGlossary`); `rulesAsk` передає глосарій у `searchRules` і `knownRuleWord`; `Ask.terms = glossaryMatches(glossary, shown ?? text)`; над результатами (після `.bfix`) — `a.terms.map(t => <GlossaryCard … empty={!a.hits.some(h => termHit(t, h))} />)` (порожньо = у результатах немає жодного пункту, знайденого цим терміном; простіше — `searchRules(TOPICS, t.term, 1, glossary).length === 0`); якщо пунктів і місць немає, але є картки — замість «не знайшов» лише картки
- [X] T014 [P] [US2] `src/components/BarDemo.tsx`: те саме, що T013 (глосарій — `glossary.json`; у US3 — `loadGlossary`)

**Checkpoint**: MVP — плашка й демо розуміють терміни й показують картки з вбудованим глосарієм.

---

## Phase 5: User Story 3 — Адмін і модератори ведуть глосарій (P2)

**Goal**: зміни команди на сайті з'являються в програмі за ≤ 10 хв; версії й відкат.

**Independent Test**: модератор додає термін у `/panel?tab=glossary` → за ≤ 10 хв картка в плашці; «Історія» → «Відкотити».

- [X] T015 [P] [US3] `src/lib/glossary.test.ts`: `loadGlossary` з підміненим клієнтом — база віддала → кеш записано; повтор < 10 хв — без запиту; помилка мережі → кеш; без кешу → JSON; кеш з бази є — JSON не підмішується
- [X] T016 [US3] `src/lib/glossary.ts`: `loadGlossary()` (research R5: `localStorage['qhub.glossary'] = { at, terms }`, TTL 10 хв, усі звернення до сховища в try/catch); для команди: `loadGlossaryAdmin()` (з `id, hidden, version, updated_at`), `saveTerm`, `hideTerm`, `unhideTerm`, `revertTerm`, `termHistory(id)` — через RPC з contracts; помилки бази — текстом як є
- [X] T017 [US3] `src/desktop/Bar.tsx` і `src/components/BarDemo.tsx`: глосарій з `loadGlossary()` (у плашці — при відкритті й не частіше ніж раз на 10 хв, як `loadPlaces`)
- [X] T018 [US3] `src/components/admin/AdminGlossary.tsx`:
  - список термінів за абеткою з фільтром і перемикачем «показати прибрані»;
  - форма (нове / правка): скорочення (1–12), інші назви (по рядку, кожна 1–80, до 20), повна назва (≤ 80), пояснення (1–300, лічильник), пов'язані пункти (по рядку, кожен ≤ 40, до 10) — помилки біля полів після blur, помилки бази (`23505`, `22023`) — під формою;
  - «Прибрати» / «Повернути»; «Історія» — версії (номер, дія людською мовою, автор, час, знімок) і «Відкотити до цієї» з підтвердженням
- [X] T019 [US3] `src/pages/Admin.tsx`: вкладка `'glossary'` «Глосарій» (іконка `book`) у групі `MODERATION`, тож її бачать і `/admin`, і `/panel` для `moderator` (не для `editor`); `views.glossary = <AdminGlossary />`

---

## Phase 6: User Story 4 — Розділ «Глосарій» на сайті (P3)

**Goal**: `/wiki/glosariy` — усі терміни, фільтр, клік розгортає пункти правил.

**Independent Test**: `/wiki/glosariy` → фільтр «вбив» → ДМ, ДБ, СК, ТК; клік «РК» → пункти під ним.

- [X] T020 [US4] `src/pages/Glossary.tsx`: `loadGlossary()`; поле фільтра (за term, aliases, full_name, description, без регістру); список за абеткою `term`; кожен термін — кнопка-рядок з `aria-expanded`; розгорнутий: картка + до 8 `RuleCard` з `searchRules(RULES.topics, term, 8, glossary)` або «Окремого пункту в правилах немає»; порожній фільтр-результат — «Такого терміну немає»
- [X] T021 [US4] `src/App.tsx` (маршрут `wiki/glosariy`), `src/pages/Wiki.tsx` (вкладка «Глосарій» після «Гайдів», іконка `book`), `src/data/pages.json` (назва вкладки й опис сторінки для пошуковиків)

---

## Phase 7: Polish & Cross-Cutting

- [X] T022 `src/data/changelog.json` — у верхній `pending` пак, `added`: «Пошук у Alt+Q розуміє RP-скорочення (ДМ, ПГ, ЗЗ…) і показує над результатами, що вони означають»; `src/data/sitenews.json` — новий запис про вкладку WIKI «Глосарій»
- [X] T023 `npm.cmd test`, `npm.cmd run typecheck` — зелені; SQL-тести — у CI цього PR
- [X] T024 Перезапустити програму з коду (пам'ять `relaunch-app-after-change`) і перевірити бандл (є «Окремого пункту в правилах немає»); ручна перевірка за `quickstart.md`
- [ ] T025 Після злиття: SQL `0080_glossary.sql` власнику в буфер; перевірка гостьовим ключем `glossary_terms?select=term&limit=1` → 200

---

## Dependencies & Execution Order

- T001 (конституція) → T002 → Phase 2. T003 → T004 (seed з JSON) → T005, T006 паралельно.
- US1 (T007–T009) після T003. US2 (T010–T014) після T008. US3 (T015–T019) після T004 і T013. US4 (T020–T021) після T016.
- T009 повторити наприкінці, якщо `rulesSearch.ts` змінювався пізніше (US2).

## Parallel Example

```text
Phase 2: T005 (SQL-тест) ‖ T006 (glossary.test) — після T004
US2:     T010 (тести) ‖ T012 (картка й стиль) ‖ T014 (демо)
US3:     T015 (тест) ‖ T018 (адмін-вкладка) — після T016
```

## Implementation Strategy

1. **MVP = Phase 1–4**: терміни в плашці й демо з вбудованим JSON — працює й без міграції.
2. **US3**: керування й живе оновлення (потрібна міграція 0080 на проді).
3. **US4**: сторінка WIKI.

Один PR; програма — паком (`pending`), сайт — з деплоєм `main`; міграцію власник накочує після зеленого CI.
