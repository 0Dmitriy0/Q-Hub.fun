# Implementation Plan: Назви міток — одна галочка на категорію

**Branch**: `086-category-labels` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/081-category-labels/spec.md`

## Summary

Категорія мапи отримує налаштування `show_labels` (так/ні, за замовчуванням «ні» — і для наявних, і для нових; рішення власника A). Мапа (сайт і програма — той самий `MapPage`) малює підпис під міткою лише коли `show_labels` категорії «так», власний підпис мітки (`map_points.show_label`) не вимкнено і назва не порожня. Адмін змінює галочку у формах «Змінити категорію» / «Нова категорія» (`src/components/MapAdmin.tsx`); права — наявна політика «map_categories: admin write». Рішення «малювати підпис» — чиста функція з тестом; права — SQL-тест.

## Technical Context

**Language/Version**: TypeScript + React 18 (сайт і інтерфейс програми), SQL (Postgres / Supabase)
**Primary Dependencies**: Leaflet (`bindTooltip` для підписів, як зараз), Supabase JS
**Storage**: Supabase — нова колонка `map_categories.show_labels boolean not null default false` (міграція `0067`)
**Testing**: `vitest` (`src/lib/mapData.test.ts`), SQL-тест `supabase/tests/category_labels_test.sql` (`supabase/tests/run.sh`), `tsc --noEmit`
**Target Platform**: сайт q-hub.fun, мапа в програмі (Alt+M) — той самий компонент
**Project Type**: web + desktop (спільний інтерфейс з `src/`)
**Performance Goals**: без змін (підписи ті самі тултіпи, їх стає менше)
**Constraints**: без міграції мапа поводиться як зараз (spec, edge case); змінює лише admin (принцип II)
**Scale/Scope**: 1 міграція, 1 SQL-тест, 1 чиста функція + тест, 2 форми адмінки, 1 рядок у `MapPage`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Не стосується гри | ✅ (N/A) |
| II. Права в базі | Змінює лише `admin` — наявна політика `map_categories: admin write` (`for all using is_admin()`); нова колонка її успадковує | ✅ |
| III. Знімки | Не стосується | ✅ (N/A) |
| IV. Перевірені дані | Не змінює дані міток, лише показ | ✅ |
| V. Програма лише додає | Не стосується черг | ✅ (N/A) |
| VI. Тести | SQL-тест: user/editor/moderator/anon не змінюють `show_labels`, admin — змінює; `vitest` для рішення «підпис» | ✅ |
| Міграції | Новий файл `0067_category_labels.sql`, ідемпотентний (`add column if not exists`) | ✅ |

Порушень немає. **Після Phase 1** — без змін, ✅.

## Project Structure

### Documentation (this feature)

```text
specs/081-category-labels/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/map-labels.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
supabase/migrations/0067_category_labels.sql   # НОВЕ: колонка show_labels, default false
supabase/tests/category_labels_test.sql        # НОВЕ: права на show_labels
src/lib/mapData.ts            # MapCategory.show_labels?; labelShown(mark, cat)
src/lib/mapData.test.ts       # + тести labelShown
src/lib/mapMarks.ts           # BUILTIN: show_labels: false (рішення A)
src/pages/MapPage.tsx         # bindTooltip лише коли labelShown(...)
src/components/MapAdmin.tsx   # галочка в «Змінити категорію» і «Нова категорія»
src/data/changelog.json       # рядок у пак (мапа в програмі)
src/data/sitenews.json        # рядок у новини сайту
```

**Structure Decision**: логіка — поруч з типами мапи (`mapData.ts`), як решта чистих функцій мапи; UI адмінки — у наявних формах.

## Complexity Tracking

Не потрібно — порушень немає.
