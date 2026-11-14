# Implementation Plan: Банер івенту на головній — без блимання, текст на всю ширину

**Branch**: `084-home-event-banner` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/079-home-event-banner/spec.md`

## Summary

Картка Хелловіну в першому екрані головної (`src/components/HalloweenBanner.tsx`) зараз показується «за замовчуванням», поки дані з бази не прийшли, — тому вона блимає, коли івенту вже немає; а сітка першого екрана (`.h-hero` у `src/styles.css`) завжди двоколонкова. Рішення (research.md): картка не малюється, доки не відомо, що івент є (з підказкою з минулого візиту на пристрої), а сітка стає двоколонковою лише тоді, коли картка справді є в розмітці (CSS `:has`). Рішення «показувати чи ні» — чиста функція з тестом.

## Technical Context

**Language/Version**: TypeScript 5 + React 18 (сайт, Vite)
**Primary Dependencies**: React Router, Supabase JS (лише наявні запити: кількість міток `pryvydy`/`harbuzy`, `season_events.ends_on`)
**Storage**: `localStorage` — один ключ-підказка «був івент при останньому візиті» (data-model.md); база не змінюється
**Testing**: `vitest` (`npx.cmd vitest run`), `tsc --noEmit`; перевірка в браузері (звичайний і сповільнений інтернет)
**Target Platform**: сучасні браузери (Chrome/Edge ≥105, Firefox ≥121, Safari ≥15.4 — підтримують `:has`); старіші — одна колонка завжди (research R2)
**Project Type**: web (SPA у корені репо; статичні копії сторінок — `scripts/static-pages.mjs`)
**Performance Goals**: 0 кадрів з карткою, коли івенту немає (SC-001); 0 зсувів тексту при повторному візиті під час івенту (SC-003)
**Constraints**: правила «івент триває» не змінюються (FR-006); текст і картинка картки — без змін (FR-007)
**Scale/Scope**: 1 компонент, 1 нова чиста функція з тестом, 2–3 правила CSS

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише сайт | ✅ (N/A) |
| II. Права в базі | Запити ті самі (публічні лічильники міток і дата івенту); правил доступу не міняємо | ✅ |
| III. Знімки приватні | Не стосується | ✅ (N/A) |
| IV. Перевірені дані | Без даних з бази картку не показуємо — «краще не показати, ніж неправдиве» (edge case) | ✅ |
| V. Програма | Не стосується | ✅ (N/A) |
| VI. Тести | Рішення «показати картку / яка» — чиста функція з `vitest` | ✅ |

Порушень немає. **Після Phase 1** — без змін, ✅.

## Project Structure

### Documentation (this feature)

```text
specs/079-home-event-banner/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/home-hero.md   # як перший екран поводиться в кожному стані
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/
├── lib/halloween.ts            # НОВЕ: чиста функція рішення + ключ підказки
├── lib/halloween.test.ts       # НОВЕ: vitest
├── components/HalloweenBanner.tsx   # не малює картку, поки невідомо; пише/читає підказку
├── pages/Home.tsx              # без змін розмітки (картка вже всередині .h-hero)
└── styles.css                  # .h-hero — одна колонка; дві — лише :has(> .h-promo)
```

**Structure Decision**: зміна лише сайту в `src/`; програма й база не чіпаються. Запис у `sitenews.json` не потрібен (spec, Assumptions).

## Complexity Tracking

Не потрібно — порушень немає.
