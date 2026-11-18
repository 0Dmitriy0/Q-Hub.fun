# Implementation Plan: Глосарій RP-термінів у пошуку по правилах

**Branch**: `093-rp-glossary` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/093-rp-glossary/spec.md`

## Summary

Пошук правил (плашка Alt+Q і демо на сайті) розгортає скорочення RP-термінів у всі їхні назви й синоніми, показує картку терміну над результатами, а сайт отримує вкладку WIKI «Глосарій». Терміни — дані у форматі власника (`term`, `aliases[]`, `full_name`, `description`, `related_rules[]`): таблиця в базі (адмін і модератори правлять з версіями й відкатом) + той самий JSON `src/data/glossary.json` як спільна вбудована копія для програми й сайту. Розширення запиту — після `normalizeQuery` (specs/092). Обов'язкові unit-тести на кожен термін і на «33» vs «зз».

## Technical Context

**Language/Version**: TypeScript 7 (React 19), SQL/PL/pgSQL (Supabase)

**Primary Dependencies**: немає нових

**Storage**: Supabase Postgres — `glossary_terms`, `glossary_versions` (міграція 0080); `src/data/glossary.json`; кеш `localStorage` у програмі

**Testing**: vitest (`rulesSearch.test.ts`, `glossary.test.ts`), SQL (`supabase/tests/glossary_test.sql`)

**Target Platform**: програма Q-Hub (плашка), сайт (WIKI, робоче місце команди, демо плашки)

**Project Type**: desktop-app + вебсайт зі спільними модулями + BaaS

**Performance Goals**: пошук без помітної затримки (SC-006); розширення — проста заміна слова на групу варіантів

**Constraints**: наявні результати не змінюються (SC-005); програма без мережі працює (FR-012); копія `rulesSearch.ts` у функції помічника лишається ідентичною

**Scale/Scope**: ~20 термінів на старті, десятки згодом

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише текст запиту в плашці | ✅ |
| II. Права — у базі | Читання — всім; зміни — лише RPC з `is_wiki_mod()`, кожна з версією й відкатом. **Потрібна правка конституції 1.3.0 → 1.4.0** (глосарій у винятку разом з довідником) — погоджено власником 2026-11-18, перша задача реалізації | ⚠️ → ✅ після T001 |
| III. Знімки приватні | Не стосується | ✅ |
| IV. Власні дані | Терміни й пояснення — від власника й команди; правила — з rules-sync | ✅ |
| V. Програма лише додає | Програма лише читає глосарій | ✅ |
| VI. Тести | SQL-тест прав і версій (дозвіл і заборона для anon, `user`, `editor`, `moderator`, `admin`); vitest на кожен термін і на «33»/«зз» | ✅ |

**Post-design re-check**: ✅ за умови T001 (конституція 1.4.0) до злиття.

## Project Structure

### Documentation (this feature)

```text
specs/093-rp-glossary/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/glossary.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
.specify/memory/constitution.md               # 1.4.0: принцип II — глосарій у винятку
supabase/migrations/0080_glossary.sql         # таблиці, RLS, 4 RPC, початковий список
supabase/tests/glossary_test.sql (+ run.sh)
src/data/glossary.json                        # спільна вбудована копія (формат власника)
src/desktop/rulesSearch.ts (+ test)           # GlossaryTerm, розширення після normalizeQuery, glossaryMatches, relatedHits
supabase/functions/assistant/rulesSearch.ts   # копія (тест звіряє)
src/lib/glossary.ts (+ test)                  # loadGlossary з кешем 10 хв; RPC команди
src/desktop/barParts.tsx                      # GlossaryCard
src/desktop/Bar.tsx, src/components/BarDemo.tsx   # картки над результатами, глосарій у пошуку
src/pages/Glossary.tsx, src/pages/Wiki.tsx, src/App.tsx, src/data/pages.json   # /wiki/glosariy
src/components/admin/AdminGlossary.tsx, src/pages/Admin.tsx                   # керування (admin + moderator)
src/data/changelog.json, src/data/sitenews.json
```

**Structure Decision**: наявна структура; один новий модуль даних (`src/lib/glossary.ts`), одна сторінка, одна вкладка команди.

## Порядок поставки

1. Конституція 1.4.0 → міграція й SQL-тест → JSON.
2. Пошук: розширення, картки, тести на кожен термін (MVP — US1+US2 у плашці з вбудованим JSON, ще без бази).
3. Керування командою (US3) і завантаження з бази в програмі.
4. Сторінка «Глосарій» (US4).

## Complexity Tracking

| Відхилення | Навіщо | Простіша альтернатива відкинута, бо |
|---|---|---|
| Таблиця в базі **і** JSON замість лише JSON (вимога плану) | Специфікація: зміни адміном/модераторами без коду, версії й відкат, підхоплення за 10 хв (FR-010, FR-010a, FR-012) | Лише JSON у репо = реліз програми на кожен термін і ніде тримати версії |
| Наявний `ALIAS` у коді лишається | Функція помічника не бачить глосарію (копія без імпортів); нічого з того, що знаходиться, не зникає | Видалити `ALIAS` — помічник утратить DM↔ДМ, а тест копії не дозволяє імпорт JSON |
| Правка конституції 1.4.0 | Модератори змінюють публічні дані напряму (рішення власника) | Лише `admin` — власник обрав інакше в `/speckit-clarify` |
