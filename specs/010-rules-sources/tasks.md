---

description: "Задачі: усі правила й закони QuantRP у програмі"
---

# Tasks: Усі правила й закони QuantRP у програмі

**Input**: `/specs/010-rules-sources/` — plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: обов'язкові за конституцією (VI): SQL-тест прав `rule_sources`, модульні тести розбору, злиття, пошуку, кешу.

## Phase 1: Setup

- [x] T001 Створити `supabase/functions/rules-sync/` за зразком `supabase/functions/assistant/` — є `parse.ts` + `parse.test.ts`; `merge.ts` і `index.ts` — у T014 і T015

## Phase 2: Foundational

- [x] T002 [P] Тест `supabase/functions/rules-sync/parse.test.ts` (vitest): `postText` — перший пост і продовження автора; `chunks` — пункти «1.4», «6.5 [Р] …» з рядком «Покарання: …» усередині пункту; заголовки «Стаття 6. …», «РОЗДІЛ 2. …», «Розділ I. …» йдуть у `h`, не в текст; абзаци без номера — шматками до 700 символів; `links()` — розділи й теми
- [x] T003 Перенести розбір з `scripts/fetch-rules.mjs` у `supabase/functions/rules-sync/parse.ts` (без залежностей Deno/Node) і додати заголовки статей і розділів (research R2); тести T002 зелені
- [x] T004 `scripts/fetch-rules.mjs` — обгортка над `parse.ts`: обидва розділи за замовчуванням (`rules`, `law`), `kind` у кожній темі; перезібрати вбудовану `src/data/rules.json`

**Checkpoint**: вбудована копія вже містить закони штату — пошук у програмі знаходить їх навіть до функції й сторінки адміна

---

## Phase 3: User Story 1 — Відповідь із законів штату (P1) 🎯 MVP

- [x] T005 [P] [US1] Тести `src/desktop/rulesSearch.test.ts`: «штраф за швидкість» → стаття Дорожнього/Адміністративного кодексу серед перших 3; «викрадення авто» → КК 6.5; «КК 4.1», «ПДР обгін», «ак штраф» (FR-008); уривок — «[Закон штату · Кримінальний кодекс штату Quant, ст. 6.5]» і «[Правила сервера · …, п. 1.2]»
- [x] T006 [US1] `src/desktop/rulesSearch.ts`: `kind` у `RuleTopic`/`RuleHit` (нема — `rules`), аліаси кодексів (research R7, слово-аліас шукає і в назві документа), уривок з типом і «ст.» / «п.»
- [x] T007 [P] [US1] Тест `supabase/functions/assistant/plan.test.ts`: підказка вимагає розрізняти правила сервера й закони штату, називати документ і номер, без пунктів — прямо сказати й не вигадувати
- [x] T008 [US1] `supabase/functions/assistant/plan.ts`: SYSTEM і `rulesBlock` — «Пункти правил сервера й законів штату…», правила відповіді з T007; `index.ts` — коментар про джерело пунктів

## Phase 4: User Story 2 — Видно, звідки відповідь (P1)

- [x] T009 [US2] `src/desktop/Bar.tsx` → `RuleCard`: позначка типу («Правила сервера» / «Закон штату» / «Наказ організації»), документ, «ст.»/«п.» і посилання на тему (FR-005); стилі позначки в `src/desktop/bar.css`
- [x] T010 [US2] Порожній результат: «У правилах і законах такого не знайшов» (FR-007)

## Phase 5: User Story 3 — Адмін керує джерелами (P2)

- [x] T011 [P] [US3] SQL-тест `supabase/tests/rule_sources_test.sql` (+ рядок наприкінці `supabase/tests/run.sh`; тестові id користувачів — вільні, перевірити `grep` по `supabase/tests/`, бо `…d1` уже зайнятий у `map_drafts_test`): anon і `user` не читають і не змінюють `rule_sources`; `admin` додає, вимикає, видаляє; адреса поза `https://forum.quant5.com.ua/index.php?/(forum|topic)/` — відмова (check); `kind` поза `rules/law/order` — відмова; два джерела за замовчуванням є; anon читає об'єкт бакета `rules`, але не пише. Локально без psql — прогін у PGlite 0.2.17 (див. specs/025 quickstart.md)
- [x] T012 [US3] Міграція `supabase/migrations/0039_rule_sources.sql` (0038 уже застосована на робочій базі — номер після неї): таблиця за data-model.md (`url` — `check (url ~ '^https://forum\.quant5\.com\.ua/index\.php\?/(forum|topic)/')`, `unique`; `kind text not null check (kind in ('rules','law','order'))`; `enabled boolean not null default true`; `items int not null default 0`; `created_by uuid references profiles default auth.uid()`), RLS — `for all using (public.is_admin()) with check (public.is_admin())`, 2 джерела за замовчуванням (`on conflict (url) do nothing`), публічний бакет `rules` (читання всім, запис — лише service-ключ); ідемпотентно (`if not exists`, `drop policy if exists`). Регулярку з «» — лише через Edit/Write
- [x] T013 [P] [US3] Тест `supabase/functions/rules-sync/merge.test.ts`: джерело з помилкою чи 0 пунктів — теми з попереднього знімка; різниця `added / changed / removed` за ключем `url + n`; тема, вимкнена окремим джерелом, не береться; тема і з розділу, і окремо — один раз, тип від окремого
- [x] T014 [US3] `supabase/functions/rules-sync/merge.ts` (тести T013)
- [x] T015 [US3] `supabase/functions/rules-sync/index.ts` (Deno, за зразком `supabase/functions/assistant/index.ts`) за contracts/rules-sync.md: доступ — admin-сесія (`profiles.role = 'admin'` через клієнт з заголовком `Authorization`) або `x-sync-secret` = `Deno.env.get('RULES_SYNC_SECRET')`; дані — клієнтом із `SUPABASE_SERVICE_ROLE_KEY`; обхід через `forumTopics`/`readTopic` з `parse.ts` послідовно з паузою 250 мс; знімок — `storage.from('rules').upload('rules.json', …, { upsert: true, cacheControl: '300' })`; результат у `rule_sources`; лише хост форуму (FR-011); CORS як у `assistant`
- [x] T016 [US3] Сторінка `src/pages/RulesAdmin.tsx` + маршрут `admin/pravyla` у `src/App.tsx` (поруч із `kabinet/*`; роль — `useAuth().role === 'admin'`, не-адміну — «Сторінка лише для адміністратора»; помилки бази з кодом `P0001` — як є): список джерел (адреса, тип, увімкнено, оновлено, пунктів, помилка, різниця), додати посилання з типом (перевірка адреси — українською), увімкнути/вимкнути, видалити, «Оновити зараз» → `rules-sync` і результат

## Phase 6: User Story 4 — Без нової версії програми (P2)

- [ ] T017 [P] [US4] Тест `desktop/src/rules.test.cjs`: свіжий знімок — у кеш; `304` — кеш; без мережі — кеш; без кешу й мережі — вбудована копія; битий JSON — не затирає кеш
- [ ] T018 [US4] `desktop/src/rules.cjs` (тести T017; мережа — через переданий `fetch`, щоб тест не ходив в інтернет): `<url з config.json>/storage/v1/object/public/rules/rules.json`, `If-None-Match` з `rules.json.etag` у `app.getPath('userData')`; у `desktop/src/main.cjs` — завантаження при старті й кожні 6 год, IPC `rules-data` (лише з плашки — `fromBar`), подія `rules-changed`; `desktop/src/preload.cjs` — `rulesData`, `onRulesChanged`
- [ ] T019 [US4] `src/desktop/Bar.tsx`: `TOPICS` — з моста (вбудована — поки не прийшло), «Правила станом на …» в результатах пошуку правил (FR-017)
- [ ] T020 [US4] `.github/workflows/rules-sync.yml`: щодня `cron: '0 1 * * *'` + `workflow_dispatch`, `curl -X POST` з `x-sync-secret: ${{ secrets.RULES_SYNC_SECRET }}`; немає секрету — крок пропускається з поясненням

## Phase 7: Polish

- [ ] T021 Запис у `src/data/changelog.json`: новий запис з id дати релізу; якщо запис того дня вже в `main` (вийшов до гравців) — `РРРР-ММ-ДД.N` (CLAUDE.md)
- [ ] T022 `npx.cmd tsc --noEmit`, `npx.cmd vitest run`, `cd desktop; npm.cmd test`, SQL-тести (PGlite локально, `run.sh` у CI) — зелене; SC-002 на 30 питаннях — у spec.md «Реалізація»
- [ ] T023 Власнику — кроки з quickstart.md «Один раз», оновити під те, як це реально робиться: міграція — вміст файлу в буфер → Supabase SQL Editor (**до** злиття в `main`); функція — у PowerShell `npx.cmd supabase functions deploy rules-sync --project-ref mcuolznwwvptffcueswm --use-api` (вхід `npx.cmd supabase login` — у звичайному терміналі, не через `!`); секрет — `npx.cmd supabase secrets set RULES_SYNC_SECRET=…` і той самий у GitHub → Settings → Secrets → `RULES_SYNC_SECRET`; секрет у чат не вставляти

## Dependencies & Execution Order

- Phase 2 → US1 (пошук по вбудованій копії) → US2 → US3 (база й функція) → US4 (програма бере знімок функції)
- US1/US2 дають цінність без US3/US4: закони штату — у вбудованій копії з новою версією програми

## Implementation Strategy

MVP — Phase 2 + US1 + US2: закони штату в пошуку й помічнику з наступною версією програми. Далі US3–US4 — оновлення без
нових версій і керування джерелами.
