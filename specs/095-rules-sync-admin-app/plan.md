# Implementation Plan: Правила форуму оновлює програма адміна

**Branch**: `095-rules-sync-admin-app` | **Date**: 2026-11-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/095-rules-sync-admin-app/spec.md`

## Summary

Форум (Cloudflare) відповідає «403» серверу Q-Hub, а домашньому ПК відповідає «200». Тож обхід форуму (розділи → теми → сторінки) виносимо в окремий модуль без залежностей середовища, `crawl.ts`, поруч із `parse.ts`. Його беруть і функція `rules-sync`, і головний процес програми. Програма адміна раз на 24 години, коли за добу не було вдалого оновлення, обходить форум сама, розбирає теми тим самим кодом і надсилає функції вже розібрані теми (~1,7 МБ замість ~10 МБ сирих сторінок). Функція перевіряє роль і форму даних, зводить знімок, веде журнал змін і пише в бакет так само, як після власного обходу. Нова таблиця `rules_sync_runs` записує кожну спробу. Щоденний workflow червоний лише тоді, коли за 24 години не було жодного вдалого оновлення.

## Technical Context

**Language/Version**: TypeScript (функція Deno, спільні модулі без залежностей середовища), CommonJS (Electron, головний процес), SQL (Postgres/Supabase)
**Primary Dependencies**: `@supabase/supabase-js` (уже є в програмі й функції), Vite lib build (`vite.lib.config.ts`), Electron `net`/`fetch` (Node 24 у головному процесі)
**Storage**: бакет `rules` (`rules.json`, `rules-changes.json`), таблиця `rule_sources` (як є), нова таблиця `rules_sync_runs`
**Testing**: vitest (спільні модулі, перевірка тіла запиту, планувальник програми), `node --test` для `*.test.cjs` програми, SQL-тест RLS у `supabase/tests/` (лише CI, див. пам'ять про SQL-тести на Windows)
**Target Platform**: Windows (програма), Supabase Edge Functions, GitHub Actions
**Project Type**: desktop-app + web-service
**Performance Goals**: обхід у фоні з паузою ≥ 1 с між сторінками (~60 сторінок ≈ 1–2 хв), без помітного навантаження на гру
**Constraints**: не частіше разу на 24 год; лише роль admin; при 403/429/перевірці зупинка без обходу; знімок не замінюється порожнім чи зменшеним понад половину
**Scale/Scope**: 3 джерела, ~60 тем, ~3400 пунктів, тіло запиту ≤ ~2 МБ

## Constitution Check

| Принцип | Як дотримано |
|---|---|
| I. Зовнішній інструмент | Програма читає форум, а не гру. З процесом гри нічого не робимо. ✓ |
| II. Права — у базі | Хто може надіслати теми, перевіряє функція через `my_role()`. Таблиця `rules_sync_runs` з RLS: читає лише admin, пише лише service role. ✓ |
| III. Знімки приватні | Знімків екрана тут немає. ✓ |
| IV. Власні й перевірені дані | Джерело те саме, що в specs/010 (форум сервера). Розбір, журнал змін і запобіжник від порожнього знімка спільні для обох шляхів. ✓ |
| V. Лише додає, працює без інтернету | Без мережі або з відмовою програма тихо пропускає запуск. Гравці й далі мають попередній знімок. ✓ |
| VI. Тести на права й логіку | SQL-тест RLS для `rules_sync_runs`. Модульні тести для `crawl.ts`, перевірки тіла, запобіжника й планувальника. ✓ |

Порушень немає, тож Complexity Tracking порожній.

## Project Structure

### Documentation (this feature)

```text
specs/095-rules-sync-admin-app/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rules-sync-app.md      # POST rules-sync з тілом від програми
│   └── rules-sync-runs.md     # таблиця, відповідь функції last_ok, правило workflow
└── checklists/requirements.md
```

### Source Code (repository root)

```text
supabase/functions/rules-sync/
├── crawl.ts            # НОВИЙ: обхід джерел → { fresh, errors, titles }; спільний для функції й програми
├── crawl.test.ts       # НОВИЙ
├── guard.ts            # НОВИЙ: перевірка тіла від програми + запобіжник «підозріло мало»
├── guard.test.ts       # НОВИЙ
├── index.ts            # змінено: crawl() замість власного циклу; режим body.via='app'; запис rules_sync_runs; last_ok у відповіді
├── parse.ts, merge.ts, changes.ts   # без змін
supabase/migrations/0081_rules_sync_runs.sql   # НОВИЙ
supabase/tests/rules_sync_runs_test.sql        # НОВИЙ
vite.lib.config.ts                             # + entry rulecrawl → desktop/src/lib/rulecrawl.cjs
desktop/src/rulesync.cjs        # НОВИЙ: коли пора, обхід через rulecrawl, надсилання; лише admin
desktop/src/rulesync.test.cjs   # НОВИЙ
desktop/src/main.cjs            # запуск rulesync після refreshRole, щогодинна перевірка
.github/workflows/rules-sync.yml   # червоний лише без вдалого оновлення за 24 год
src/pages/RulesAdmin.tsx                       # стан останнього оновлення (джерело, час, результат)
src/data/changelog.json            # рядок у пак pending
```

**Structure Decision**: обхід форуму стає спільним модулем (`crawl.ts`), так само як уже спільний `parse.ts` (його бере і функція, і `scripts/fetch-rules.mjs`). Так у функції й програмі один алгоритм обходу, і FR-006 виконується без дублювання. Програма надсилає розібрані теми, а не сирі сторінки: тіло ~1,7 МБ замість ~10 МБ, і функції не треба повторювати обхід по сторінках.

## Complexity Tracking

Порушень конституції немає.
