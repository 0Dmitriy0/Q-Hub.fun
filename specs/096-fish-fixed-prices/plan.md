# Implementation Plan: Скупник риби — фіксовані ціни й нові види риби

**Branch**: `096-fish-fixed-prices` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/096-fish-fixed-prices/spec.md`

## Summary

Скупник отримує в базі ознаку `fixed_prices` і необов'язковий ліміт продажу. Для фіксованого скупника:

- ціну ставить лише staff, і вона одразу поточна. Голоси гравців і програми база відхиляє;
- `set_next_change` відмовляє, таймера й меж немає;
- розбіжність «на екрані інша ціна» йде адміну через наявний `report_limit_mismatch` (таблиця `buyer_limit_reports`).

Міграція 0082 робить таке:

- додає стовпці й перевірки;
- вставляє 6 нових видів риби з іконками;
- через тригер історії ставить 20 цін зі знімків від 24.11;
- вмикає `fixed_prices` скупнику `fish`.

Сайт (`Prices.tsx`) і програма (пошук Alt+Q, `pricescan.cjs`) приховують таймер і межі та показують позначку «фіксована ціна» й ліміт. Програма для фіксованого скупника не надсилає цін, не просить дочитувати список, а розбіжність передає адміну. Шість нових SVG-іконок малюємо в стилі наявних `public/icons/fish/*.svg`.

## Technical Context

**Language/Version**: TypeScript 5 (сайт, React 18 + Vite), Node/Electron CommonJS (програма `desktop/src/*.cjs`), PL/pgSQL (Supabase)

**Primary Dependencies**: Supabase JS (сайт і програма), tesseract OCR (наявний `vision.cjs`, без змін)

**Storage**: Supabase Postgres: `buyers`, `items`, `buyer_items`, `price_reports`, `price_history` (тригер 0003/0055), `buyer_limit_reports` (0030)

**Testing**: vitest (`src/**/*.test.ts`), `node --test` (`desktop/src/*.test.cjs`), SQL-тести в CI (локально Postgres немає, див. пам'ять `sql-tests-local-windows`)

**Target Platform**: сайт (GitHub Pages), програма Windows (Electron), база Supabase

**Project Type**: web-app + desktop-app зі спільною базою

**Performance Goals**: без нових вимог; програма не повинна читати вікно скупника риби частіше, ніж тепер

**Constraints**: міграцію застосовує власник вручну (SQL Editor), бувають пропуски (пам'ять `prod-migrations-gaps`). Стара програма гравців до випуску пака ще надсилає ціни риби: база має їх відхиляти так, щоб черга програми їх викинула, а не застрягла.

**Scale/Scope**: 1 скупник, 20 товарів, 6 іконок, 1 міграція, ~4 файли сайту, ~3 файли програми

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише читаємо екран гри й показуємо дані. У гру нічого не вводимо | ✅ |
| II. Права — у базі | `fixed_prices`, ліміт і ціни фіксованого скупника змінює лише staff. Перевірку робить RLS чи `security definer` з `is_staff()`, а не інтерфейс | ✅ |
| III. Знімки приватні | Навчальні знімки лише джерело чисел для сіду. Самі знімки нікуди не викладаємо | ✅ |
| IV. Власні й перевірені дані | Ціни — з гри (знімки власника), внесені staff, тобто ручне внесення staff, підтверджене одразу. Іконки малюємо самі, фото риб з гри не копіюємо. OCR-розбіжність іде людині на перевірку, а не в базу | ✅ |
| V. Програма лише додає | Програма для фіксованого скупника нічого не змінює. Розбіжність лише додає рядок у `buyer_limit_reports`. Відхилений голос черга викидає (`denied` → `drop`, `outbox.cjs:23`) | ✅ |
| VI. Тести на права й логіку | SQL-тест: гравець не може змінити `fixed_prices`, ціну чи час зміни. Голос гравця за фіксованого скупника відхилено. Unit-тести `pricescan` для фіксованого скупника | ✅ |

Порушень немає, Complexity Tracking порожній.

**Після Phase 1**: дизайн не додав нових таблиць, ролей чи шляхів запису в обхід бази. Гейти ✅.

## Project Structure

### Documentation (this feature)

```text
specs/096-fish-fixed-prices/
├── plan.md              # цей файл
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── fixed-prices.md  # RPC, тригери, поля, які читають сайт і програма
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/migrations/
└── 0082_fixed_price_buyers.sql      # стовпці, перевірки, 6 риб, 20 цін, fish.fixed_prices = true
supabase/tests/                      # SQL-тест прав і відхилення голосів (за наявним зразком)

public/icons/fish/
├── carp.svg  pike.svg  catfish.svg  salmon.svg  moray.svg  sturgeon.svg   # нові
└── map.json                          # + 6 назв

src/pages/Prices.tsx                  # позначка «фіксована ціна», без таймера й меж, ліміт, перемикач і ціни для staff
src/lib/usePrices.ts                  # читає fixed_prices, sale_limit
src/data/changelog.json               # запис у пак pending

desktop/src/pricescan.cjs             # фіксований скупник: не надсилати, покриття не вимагати, розбіжність → report
desktop/src/pricescan.test.cjs
desktop/src/main.cjs                  # visionCatalog і завантаження цін: + fixed_prices; набір «не надсилати»
src/desktop/…                         # пошук Alt+Q: позначка й без таймера (файл уточнить tasks)
```

**Structure Decision**: наявна структура «сайт + програма + Supabase». Нових модулів немає, змінюються наявні точки цін.

## Complexity Tracking

Порушень конституції немає.
