# Tasks: Правила форуму оновлює програма адміна (095)

**Input**: `specs/095-rules-sync-admin-app/` (plan.md, spec.md, research.md, data-model.md, contracts/)
**Tests**: потрібні за конституцією (VI): модульні для логіки, SQL для RLS.

## Phase 1: Setup

- [x] T001 Додати entry `rulecrawl: 'supabase/functions/rules-sync/crawl.ts'` у `vite.lib.config.ts` (вихід `desktop/src/lib/rulecrawl.cjs`), оновити коментар файлу

## Phase 2: Foundational (блокує всі історії)

- [x] T002 Створити `supabase/functions/rules-sync/crawl.ts`: `crawl(get: Get, sources: SourceRow[]) → { fresh: SnapTopic[], errors: Map<number,string>, titles: Map<number,string> }`. Перенести цикл з `index.ts:54-70` дослівно (розділи → `forumTopics`, `plan()`, `readTopic`). Без залежностей середовища.
- [x] T003 [P] Тести `supabase/functions/rules-sync/crawl.test.ts`: фейковий `get` з 2 джерелами (розділ + окрема тема), помилка одного джерела не зупиняє інше, titles заповнюються.
- [x] T004 Перевести `supabase/functions/rules-sync/index.ts` на `crawl()` без зміни поведінки (`vitest` зелений)
- [x] T005 [P] Міграція `supabase/migrations/0081_rules_sync_runs.sql`: таблиця `rules_sync_runs` (id bigint identity PK; at timestamptz not null default now(); via text not null check (via in ('server','app')); by uuid null references auth.users on delete set null; ok boolean not null; topics int; items int; changes int; error text), індекс `(ok, at desc)`, RLS: select лише `public.my_role() = 'admin'`, без insert/update/delete для ролей
- [x] T006 [P] SQL-тест `supabase/tests/rules_sync_runs_test.sql`: admin читає, user/anon — 0 рядків, insert від authenticated відхиляється

## Phase 3: US1 + US3 — програма адміна оновлює правила, сервер приймає лише від адміна (P1) 🎯 MVP

**Independent Test**: програма адміна без вдалого оновлення за 24 год обходить форум і надсилає теми; `rules_sync_runs` має `via='app', ok=true`; запит не-адміна або з секретом і `via:'app'` → 403.

- [x] T007 [P] [US3] `supabase/functions/rules-sync/guard.ts`: `checkAppBody(body, sources)` за data-model.md: «`fresh` — масив ≤ 300 тем; `title` (≤ 300), `section` (≤ 300), `url` на `forum.quant5.com.ua` (≤ 500), `kind ∈ rules|law|order|info`, `src` — id наявного ввімкненого джерела, `items` ≤ 2000 з `n` (≤ 40), `h` (≤ 300), `s` (≤ 20000)»; `errors`/`titles` лише з id наявних джерел, рядки ≤ 500 → `{ ok, fresh, errors, titles } | { ok:false, error }`
- [x] T008 [P] [US3] Тести `supabase/functions/rules-sync/guard.test.ts`: чужий хост, невідомий src, задовгий рядок, невірний kind → помилка зі зрозумілим текстом; коректне тіло → ok
- [x] T009 [US1] `index.ts`: режим `body.via === 'app'`: лише `Authorization` ролі admin (секрет + `via:'app'` → 403), тіло > 4 МБ → 413, `checkAppBody` → 400, далі `merge/changes/upload` як для власного обходу; запис `rules_sync_runs` (via, by = id адміна або null, ok, topics, items, changes, error) для кожної відповіді крім 403; видалення рядків старших 90 днів; `last_ok` у відповіді
- [x] T010 [P] [US1] `desktop/src/rulesync.cjs`: `createRuleSync({ dir, getRole, sb, crawl, fetch, log, now })` — `due()` (admin, локальний `rulesync.json.lastAttempt` ≥ 24 год, у базі немає `ok` за 24 год), `run()`: джерела з `rule_sources` (enabled), `crawl(get)` з `get` (лише хост форуму, UA `Mozilla/5.0 Q-Hub rules sync`, пауза 1 с), надсилання `sb.functions.invoke('rules-sync', { body: { via:'app', version, fresh, errors:[...], titles:[...] } })`, запис `rulesync.json` і `rulesync.log`
- [x] T011 [P] [US1] Тести `desktop/src/rulesync.test.cjs`: не admin → не запускається; спроба < 24 год → пропуск; ok у базі < 24 год → пропуск; успіх → invoke з `via:'app'` і запис lastResult 'ok'
- [x] T012 [US1] `desktop/src/main.cjs`: підключити `require('./lib/rulecrawl.cjs')` і `rulesync.cjs`; перша перевірка через 2 хв після входу (або одразу з `QHUB_RULESYNC_NOW=1`), далі щогодини; не запускати двічі паралельно; після вдалого запуску оновити локальний знімок правил (`rulesSnap()`)

## Phase 4: US2 — чесне читання, зупинка на відмові (P1)

**Independent Test**: `get` на 403 чи сторінці перевірки зупиняє весь запуск, нічого не надіслано, `lastResult='forum'`.

- [x] T013 [US2] У `desktop/src/rulesync.cjs` `get`: будь-яка відповідь ≠ 200, або 200 зі сторінкою перевірки (`challenge-platform`, `Just a moment`, заголовок `cf-mitigated`) чи без ознак форуму IPS → кидає `ForumBlocked`; `run()` ловить його, нічого не надсилає, пише `lastResult:'forum'` з причиною. Помилка окремої теми, що не є блоком (напр. 404 теми), лишається помилкою джерела, як на сервері
- [x] T014 [P] [US2] Тести в `desktop/src/rulesync.test.cjs`: 403, 429, 200 + `Just a moment…` → без invoke, lastResult 'forum', наступна спроба лише через 24 год; кількість запитів ≤ кількості сторінок

## Phase 5: US4 — workflow червоніє лише по ділу (P2)

- [x] T015 [US4] `index.ts`: коли всі джерела з помилкою, `rules.json` не перезаписувати (`ok=false`); запобіжник «підозріло мало пунктів» у `guard.ts` (`suspicious(prev, fresh, sources)`: 0 тем або items < 50 % від попередніх → помилка джерела «підозріло мало пунктів (N замість M) — знімок не змінено») для обох режимів + тест у `guard.test.ts`
- [x] T016 [US4] `.github/workflows/rules-sync.yml`: правило з contracts/rules-sync-runs.md (all-error + `last_ok` < 24 год → `::notice::`, інакше `::error::` і exit 1)

## Phase 6: US5 — адмін бачить стан (P3)

- [x] T017 [US5] `src/pages/RulesAdmin.tsx`: блок «Останні оновлення» з `rules_sync_runs` (10 останніх: час, «сервер»/«програма адміна», тем/пунктів, причина помилки)

## Phase 7: Polish

- [x] T018 Рядок у пак `src/data/changelog.json` (верхній `pending`, група changed): «Правила й закони знову оновлюються щодня»
- [x] T019 Перевірити: `npx.cmd tsc --noEmit -p .`, `npx.cmd vitest run`, `node --test desktop/src/*.test.cjs`, збірки `vite.app`/`vite.lib`; бандл містить `rulecrawl.cjs`
- [x] T020 Перевірити наживо (пам'ять self-verify): програма з `QHUB_RULESYNC_NOW=1` проти **задеплоєної** функції — після деплою функції й міграції власником; до того — димовий запуск з підробленим `invoke`, що лише перевіряє тіло (кількість тем ~60, пунктів ~3400)

## Dependencies

- T001 → T012; T002 → T003, T004, T010; T005 → T009 (запис у таблицю), T017
- US1/US3 (T007–T012) → US2 (T013–T014, той самий файл) → US4 → US5
- Деплой функції й міграції (власник, вручну) — перед T020 і перед тим, як злиття дасть ефект

## Parallel

- T003, T005, T006 паралельно після T002
- T007/T008 і T010/T011 паралельно (різні файли)

## Implementation Strategy

MVP — Phase 1–3: правила знову оновлюються з програми адміна. Далі US2 (захист), US4 (workflow), US5 (вигляд).

> T020 (24.11): живий обхід з ПК — 63 сторінки за 74 с, 54 теми / 3190 пунктів (2 джерела), тіло 0,95 МБ, відправка — фейк; справжній знімок (60 тем) проходить guard. Проти задеплоєної функції — після міграції 0081 і деплою.
> T020 (24.11, 21:33): проти задеплоєної функції — програма з коду, 3 джерела, 70 сторінок / 84 с, 59 тем / 3251 пункт, журнал змін +210; rules.json.fetched = 2026-11-24T19:33:21Z.
