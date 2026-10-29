# Implementation Plan: Один скупник «Шкури» замість «Шкури» й «М'ясо»

**Branch**: `003-merge-hide-meat-buyers` (робота — у `main`, як і решта) | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-merge-hide-meat-buyers/spec.md`

## Summary

У грі «Шкури» — один скупник, а сайт показує ще й «М'ясо». Міграція `0028` переносить 8 товарів м'яса з усіма
цінами, межами, історією й повідомленнями до `hide` (оновленням `buyer_id`, без копій — тригери історії не спрацьовують),
лишає пізніший таймер і видаляє `meat`. Таблиця `buyer_aliases ('meat' → 'hide')` і before-insert тригер на
`price_reports` приймають ціни зі старих версій програми. Програма впізнає заголовок «м'ясо» як `hide`.
Сайт змін не потребує — вкладки будуються з таблиці `buyers`.

## Technical Context

**Language/Version**: SQL (Postgres / Supabase) — головна зміна; JavaScript CommonJS (Electron 37) — програма

**Primary Dependencies**: немає нових

**Storage**: Supabase Postgres: `buyers`, `buyer_items`, `price_history`, `price_reports`; нова `buyer_aliases`

**Testing**: `supabase/tests/*.sql` через `run.sh` (CI), `node --test` (програма), `vitest` (сайт — регресія)

**Target Platform**: сайт q-hub.fun, Q-Hub Desktop (Windows)

**Project Type**: web + desktop app з спільною базою

**Performance Goals**: міграція — частки секунди (≈40 товарів, сотні рядків історії)

**Constraints**: міграцію застосовує власник вручну (Supabase → SQL Editor), тож вона MUST бути ідемпотентною;
старі версії програми продовжують надсилати `meat` (R3)

**Scale/Scope**: 1 міграція, 1 SQL-тест, 1 правка розпізнавання в програмі, 2 сіди

## Constitution Check

| Принцип | Як дотримано |
|---|---|
| I. Зовнішній інструмент | програма лише інакше називає розпізнаного скупника — нових дій у грі немає ✅ |
| II. Права — у базі | `buyer_aliases` — лише читання для клієнтів; `merge_buyer` — без execute для anon/authenticated; права на `buyers`/`price_reports` не змінюються ✅ |
| III. Знімки приватні | не зачіпається ✅ |
| IV. Власні й перевірені дані | правило «3 гравці за 48 год» не змінюється; повідомлення переносяться разом з товаром, тож підтвердження не скидається ✅ |
| V. Програма лише додає | програма й далі лише додає ціни; злиття робить міграція, не програма ✅ |
| VI. Тести | `buyers_merge_test.sql`: дозвіл і заборона для anon і user на `buyer_aliases`/`merge_buyer`, перенесення, псевдонім, повтор; `pricescan.test.cjs` ✅ |
| Міграції новим файлом, ідемпотентні | `0028_merge_meat_into_hide.sql`: `if not exists`, функція без ефекту, коли `meat` немає ✅ |

**Після дизайну (Phase 1)**: порушень немає, Complexity Tracking порожній.

## Project Structure

### Documentation (this feature)

```text
specs/003-merge-hide-meat-buyers/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── database.md
│   └── desktop.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/
├── migrations/0028_merge_meat_into_hide.sql   # buyer_aliases, тригер price_reports_alias,
│                                              # set_next_change з псевдонімом, merge_buyer('meat','hide')
├── tests/buyers_merge_test.sql                # R8
├── tests/run.sh                               # + новий тест
└── seed/catalog_from_hub.sql, history_from_hub.sql   # meat → hide (R7)

desktop/src/
├── pricescan.cjs          # «м'ясо» → hide (R6)
└── pricescan.test.cjs
```

**Structure Decision**: зміна майже повністю в базі; сайт (`src/pages/Prices.tsx`) і статична копія
(`scripts/snapshot.mjs`) підхоплюють її самі. Порядок випуску: спершу міграція (власник у SQL Editor), потім push
програми — нова програма шле `hide`, а `hide` уже має товари м'яса.

## Complexity Tracking

Порушень конституції немає.
