# Implementation Plan: Хто й коли заміряв заробіток роботи

**Branch**: `093-job-pay-credits` (спека — `087-job-pay-credits`) | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/087-job-pay-credits/spec.md`

## Summary

У блоці «Заробіток» діалогу роботи (`src/components/JobDialog.tsx:77`) показати текст по частинах і під кожною — хто заміряв (автор пропозиції), хто підтвердив (модератор), дата публікації, позначка «давно не перевіряли» (> 30 днів). Дані вже є: `wiki_versions` (знімок роботи з `pay`, `author`, `decided_by`, `created_at`; читання — усім) та імена з `wiki_contributors` (той самий кеш `loadNames()`, що в `PageMeta`). Логіка — чиста функція `payCredits(versions)` у `src/lib/payCredits.ts` з тестами `vitest`: розбиває `pay` кожної версії на частини (« · » / новий рядок, ключ — до двокрапки) і для кожної теперішньої частини знаходить версію, де вона набула теперішнього тексту. Без нової міграції, без змін прав.

## Technical Context

**Language/Version**: TypeScript 5, React 18 (сайт)

**Primary Dependencies**: `@supabase/supabase-js` (наявний клієнт `src/lib/supabase`), наявні `loadNames()` (`src/components/wiki/PageMeta.tsx`)

**Storage**: лише читання — `public.wiki_versions` (RLS «wiki versions: read» `using (true)`), `public.wiki_contributors` (view, `grant select` anon/authenticated)

**Testing**: `vitest` — `src/lib/payCredits.test.ts`

**Target Platform**: сайт (довідник «Роботи»); демо й програма не зачіпаються

**Project Type**: web (React SPA + Supabase)

**Performance Goals**: текст заробітку — одразу з `jobs` (як зараз); підписи — один запит версій цієї роботи (≤ 100, як у `HistoryDialog`) при відкритті діалогу, ≤ 2 с (SC-003); імена — з кешу `loadNames()`

**Constraints**: лише імена з `wiki_contributors` (SC-004); без бази — як зараз (FR-009); без нових політик і міграцій

**Scale/Scope**: 1 чистий модуль + тести, 1 компонент блоку заробітку, кілька рядків CSS, запис у `sitenews.json`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Вплив | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише сайт | ✅ |
| II. Права — у базі | Лише читання таблиць, відкритих усім (`wiki_versions`, `wiki_contributors`); нових прав немає | ✅ |
| III. Знімки приватні | Не стосується | ✅ |
| IV. Власні й перевірені дані | Показує, хто заміряв і хто підтвердив, — підсилює перевірюваність | ✅ |
| V. Програма лише додає | Програму не змінює | ✅ |
| VI. Тести | Чиста логіка `payCredits` — `vitest`; правила доступу не змінюються → SQL-тест не потрібен | ✅ |
| Процес | Українські тексти; зміна лише сайту → `src/data/sitenews.json` (не журнал програми) | ✅ |

Порушень немає. Повторна перевірка після Phase 1 — без змін.

## Project Structure

### Documentation (this feature)

```text
specs/087-job-pay-credits/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── pay-credits.md      # payCredits(): вхід (версії), вихід (частини з підписами), правила
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/lib/
├── payCredits.ts           # НОВИЙ: splitPay, partKey, payCredits(versions, now) → PayPart[]
└── payCredits.test.ts      # НОВИЙ: vitest
src/components/
├── JobDialog.tsx           # блок «Заробіток» → <PayBlock>
└── wiki/PayBlock.tsx       # НОВИЙ: частини + підписи; завантаження версій і імен
src/styles.css (або стилі довідника)  # .jd-pay-part, .jd-pay-by, позначка «давно»
src/data/sitenews.json      # запис для новин сайту
```

**Structure Decision**: як `PageMeta` / `HistoryDialog` — компонент у `src/components/wiki/`, чиста логіка в `src/lib/` з тестами.

## Complexity Tracking

Порушень конституції немає — розділ порожній.
