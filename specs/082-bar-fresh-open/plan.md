# Implementation Plan: Alt+Q щоразу відкривається чистою

**Branch**: `087-bar-fresh-open` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/082-bar-fresh-open/spec.md`

## Summary

При кожному відкритті Alt+Q (`api.onQuickShow` у `src/desktop/Bar.tsx`) плашка вже скидає рядок пошуку, вигляд, ціни й історію-колонку, але не список відповідей сесії `asks` — тому `expanded` одразу `true` і плашка розгорнута зі старими результатами. Рішення: при відкритті лишати з `asks` тільки відповіді, що прийшли, поки плашку не бачили (позначка `unseen`, ставиться, якщо вікно плашки не у фокусі в момент приходу відповіді ШІ), і знімати з них позначку. Усе інше вже зберігається в «Історії» (`api.histAdd`). Чиста функція з тестом.

## Technical Context

**Language/Version**: TypeScript + React 18 (інтерфейс плашки, `src/desktop/`)
**Primary Dependencies**: наявні: `api.onQuickShow`, `api.histAdd`, `History.tsx`
**Storage**: N/A — «Історія» вже в `history.json` головного процесу, не змінюється
**Testing**: `vitest` — `src/desktop/barReset.test.ts`; `tsc --noEmit`
**Target Platform**: Windows, плашка Alt+Q поверх гри
**Project Type**: desktop-app (інтерфейс з коду сайту)
**Performance Goals**: N/A
**Constraints**: у межах одного відкриття відповіді накопичуються як зараз (FR-003); режим не скидається (FR-005)
**Scale/Scope**: ~10 рядків у `Bar.tsx` + чиста функція з тестом

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише вигляд плашки | ✅ |
| II–IV | Не стосується (база, знімки, дані не змінюються) | ✅ (N/A) |
| V. Програма лише додає | «Історія» не змінюється, нічого не видаляється з диска | ✅ |
| VI. Тести | Відбір відповідей при відкритті — чиста функція з `vitest` | ✅ |

Порушень немає. **Після Phase 1** — без змін, ✅.

## Project Structure

### Documentation (this feature)

```text
specs/082-bar-fresh-open/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/bar-open.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/desktop/barReset.ts       # НОВЕ: freshAsks(asks) — що лишити на плашці при новому відкритті
src/desktop/barReset.test.ts  # НОВЕ: vitest
src/desktop/Bar.tsx           # Ask + unseen?; ask(): позначка, якщо вікно не у фокусі; onQuickShow: setAsks(freshAsks)
src/data/changelog.json       # рядок у пак (pending)
```

**Structure Decision**: чиста функція поруч з плашкою (`src/desktop/`), як `streamer.ts`, `pinStatus.ts`.

## Complexity Tracking

Не потрібно — порушень немає.
