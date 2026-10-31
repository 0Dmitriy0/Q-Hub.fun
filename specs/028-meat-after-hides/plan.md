# Implementation Plan: М'ясо — під шкурами, а не посередині

**Branch**: `028-meat-after-hides` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/028-meat-after-hides/spec.md`

## Summary

Підгрупа товару вже є в базі (`items.sub`: у «Шкур» — 32 «Шкури» і 8 «М'ясо», в інших 8 скупників — по одній,
що зветься як скупник; перевірено на робочій базі 2026-10-31). Її просто ніхто не читає. Додаємо `sub` у запити
сайту, знімка й програми, а порядок рахує одна чиста функція `subRanks(buyer, subs)` у `src/lib/subOrder.ts`:
основна підгрупа — 0, решта — 1, 2… за абеткою. Сайт «Ціни» сортує за назвою як (ранг, назва) і ставить
підзаголовок перед блоком з рангом > 0; плашка Alt+Q — (є на складі, ранг, назва). Без міграції.

## Technical Context

**Language/Version**: TypeScript 5 (сайт і інтерфейс плашки, React + Vite), CommonJS Node / Electron (`main.cjs`)
**Primary Dependencies**: `@supabase/supabase-js`; без нових залежностей
**Storage**: Supabase Postgres — `items.sub` (наявний стовпець з 0001), лише читання
**Testing**: `vitest` (`subOrder.test.ts`, `barSearch.test.ts`)
**Target Platform**: сайт q-hub.fun, Q-Hub Desktop (плашка Alt+Q)
**Project Type**: веб-сайт + desktop-програма над спільною базою
**Performance Goals**: сортування ≤ 50 рядків — без помітної різниці
**Constraints**: старий кеш браузера й старий знімок без `sub` мають працювати (товар без підгрупи = основна);
інші скупники виглядають точно як зараз (SC-003)
**Scale/Scope**: 1 новий модуль + тест, правки в `Prices.tsx`, `styles.css`, `snapshot.mjs`, `main.cjs`, `barSearch.ts`

## Constitution Check

*GATE: перевірено до Phase 0 і після Phase 1.*

| Принцип | Як дотримано |
|---|---|
| I. Зовнішній інструмент | гра не зачіпається |
| II. Права — у базі | лише читання публічного каталогу; RLS без змін |
| III. Знімки приватні | не зачіпається |
| IV. Перевірені дані | ціни, межі й підтвердження не змінюються (FR-007) — лише порядок показу |
| V. Програма лише додає | програма нічого не пише; додається одне поле в читанні |
| VI. Тести | `subOrder.test.ts` (основна за назвою, за кількістю, нічия, без підгрупи), `barSearch.test.ts` (склад + м'ясо) |

Порушень немає.

## Project Structure

```text
specs/028-meat-after-hides/
├── plan.md  research.md  data-model.md  quickstart.md  tasks.md
src/lib/subOrder.ts (+ .test.ts)   — ранги підгруп
src/pages/Prices.tsx, src/styles.css — сортування й підзаголовок
scripts/snapshot.mjs                — sub у знімку
desktop/src/main.cjs                — sub у barPrices
src/desktop/barSearch.ts (+ test)   — порядок у плашці
```

**Structure Decision**: одна функція в `src/lib`, яку імпортують і сторінка, і плашка (плашка збирається тим самим
Vite), — правило в одному місці, без дзеркала в `.cjs`.

## Complexity Tracking

Немає.
