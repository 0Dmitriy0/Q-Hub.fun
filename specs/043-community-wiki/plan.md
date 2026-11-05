# Implementation Plan: Гравці самі наповнюють і виправляють довідник

**Branch**: `043-wiki` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/043-community-wiki/spec.md`

## Summary

Гравці з входом пропонують правки й нові сторінки в «Роботах» і «Транспорті»; `admin` і `moderator` приймають
(можна з власними виправленнями) чи відхиляють з причиною в одній черзі адмінки; кожна публікація — версія в історії
з відкатом. Роботи переїжджають з коду (`src/data/jobs.ts`) у таблицю `jobs`; пропозиції й версії — спільні таблиці
`wiki_proposals` / `wiki_versions` з посиланням на розділ і ціль; публікує лише функція бази `wiki_decide` з перевіркою
ролі й білим списком полів (research R1–R3). Скріни-докази — приватний bucket (R4). Рейтинг — view за прийнятими
правками (R7). P3 (US6 «Актуально», примітки) і мітки мапи (US5) — наступними фазами.

## Technical Context

**Language/Version**: TypeScript 5 (React 19, Vite 8) — сайт; PostgreSQL 15 (Supabase) — SQL і PL/pgSQL

**Primary Dependencies**: `@supabase/supabase-js` 2 (сайт), Supabase Auth (Discord), Storage, RLS

**Storage**: Supabase Postgres — нові `jobs`, `wiki_proposals`, `wiki_versions`, `wiki_settings`, `wiki_bans`,
view `wiki_contributors`; доповнення `vehicles`; bucket `wiki-proof` (приватний)

**Testing**: `vitest` — чиста логіка (`src/lib/wiki.ts`: поля розділів, «було → стало», схожі назви, транслітерація id);
`supabase/tests/wiki_test.sql` — права й переходи стану (принцип VI); `tsc --noEmit`

**Target Platform**: сайт q-hub.fun (браузер, 375–1280 px); програма не змінюється (R10)

**Project Type**: вебзастосунок (SPA) + база Supabase

**Performance Goals**: форма правки — до 2 хв для гравця (SC-001); черга відкривається < 1 с при сотнях пропозицій
(індекс `(status, created_at)`)

**Constraints**: публічні дані змінюються лише рішенням `admin`/`moderator` (SC-004 — гарантує база); скріни видно лише
автору й модераторам (SC-006); вміст робіт не губиться під час переносу (FR-026); мапа в програмі не стає порожньою

**Scale/Scope**: ~30 робіт, ~1000 авто, десятки–сотні пропозицій на місяць; 2 розділи в першій черзі

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише сайт; нічого з грою | ✅ |
| II. Права — у базі | Публікація лише `wiki_decide`/`wiki_revert` з перевіркою `my_role()`; прямий запис `jobs`/`vehicles` — `is_admin()`; виняток 1.3.0 (admin + moderator публікують довідник). `vehicles` зараз пише `is_staff()` — звужується до `is_admin()` | ✅ (з виправленням наявного розходження) |
| III. Знімки приватні | Bucket `wiki-proof`, свої теки, читають автор і модератори, видалення після рішення (≤ 30 днів) | ✅ |
| IV. Власні дані | Поле «Звідки знаєш», нагадування про копіювання, готова причина «копія з іншого сайту»; ціни не змінюються пропозиціями | ✅ |
| V. Програма лише додає | Програма не змінюється; мапа в програмі — з запасом `jobs.ts` | ✅ |
| VI. Тести | `wiki_test.sql`: гравець не публікує, не бачить чужі пропозиції й скріни, editor не пише `vehicles`, ліміт і заборона, конфлікт; `vitest` для `lib/wiki.ts` | ✅ |
| Безпека | Нових секретів немає | ✅ |

**Після Phase 1**: дизайн (data-model, contracts) нічого не порушує; ✅.

## Project Structure

### Documentation (this feature)

```text
specs/043-community-wiki/
├── plan.md              # цей файл
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── wiki-rpc.md      # функції бази й помилки
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/
├── migrations/0057_community_wiki.sql     # таблиці, RLS, тригер, wiki_clean/decide/revert/unhide/seen, view, bucket, seed робіт
└── tests/wiki_test.sql                    # права й переходи стану
scripts/jobs-seed.mjs                      # src/data/jobs.ts → insert … on conflict do nothing (у міграцію)
src/
├── lib/wiki.ts (+ wiki.test.ts)           # поля розділів, diff «було → стало», схожі назви, id з назви
├── lib/jobsData.ts                        # роботи з бази з запасом JOBS; хук для Jobs, JobDialog, mapMarks
├── components/wiki/
│   ├── ProposeForm.tsx                    # форма правки / нової сторінки / «прибрати» (поля розділу, джерело, скрін)
│   ├── DiffView.tsx                       # «було → стало» поле за полем
│   ├── PageMeta.tsx                       # автор, «Останнім оновив», «Нове / Оновлено», «Історія»
│   └── HistoryDialog.tsx                  # версії картки; відкат — лише модератор
├── components/admin/AdminWiki.tsx         # черга: фільтри, лічильник і вік, прийняти / з правками / відхилити, заборона
├── pages/Jobs.tsx, components/JobDialog.tsx, pages/Transport.tsx, components/VehicleEdit.tsx  # кнопки й дані з бази
├── pages/cabinet/…                        # «Мої правки» + значок рішень
└── pages/Admin.tsx                        # вкладка «Довідник»; «Гравці» — прийняті/відхилені
```

**Structure Decision**: наявна структура SPA (`src/pages`, `src/components`, `src/lib`) + міграція й SQL-тест у
`supabase/`; нових пакетів і функцій Supabase не потрібно — усе через RLS і RPC.

## Фази реалізації (для /speckit-tasks)

1. **Основа**: міграція 0057 (без P3), `wiki_test.sql`, `lib/wiki.ts` + тести, `jobsData.ts` — сайт читає роботи з бази.
2. **US1 + US3 (MVP)**: «Запропонувати правку» на картках, черга в адмінці, історія й відкат, «Мої правки».
3. **US2**: «Додати» з підказкою дублів; «Прибрати сторінку».
4. **US4**: рейтинг «Довідник», автори на картках, «Гравці» в адмінці.
5. **Пізніше**: US5 (мітки мапи), US6 (P3), «Предмети» разом з 045.

Застосування на базі — вручну власником; перевірка слідів міграції — quickstart, крок 2.

## Complexity Tracking

| Відхилення | Навіщо | Чому не простіше |
|---|---|---|
| `vehicles` RLS звужується з `is_staff()` до `is_admin()` | Зараз `editor` пише довідник напряму — проти принципу II і SC-004 | Лишити як є — правка `editor` минала б чергу й історію |
