# Implementation Plan: Мітка Alt+F9 — зелений «знайдено», червоний «не знайдено»

**Branch**: `085-pin-found-color` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/080-pin-found-color/spec.md`

## Summary

Форма мітки після Alt+F9 (`PinAsk` у `src/desktop/Bar.tsx`) отримує кольоровий блок стану зверху (зелений — точку знайдено, червоний — ні) зі значком, і рамку знімка того ж кольору. Для «не знайдено» — причина читабельно плюс підказка дії, різна для гравця й адміна. Щоб підказка залежала від причини, головний процес додає в повідомлення `pin-ask` код причини (`kind`), а не лише готовий текст. Тексти стану — чиста функція з тестом.

## Technical Context

**Language/Version**: TypeScript + React 18 (плашка, `src/desktop/`), JavaScript CommonJS (головний процес, `desktop/src/main.cjs`)
**Primary Dependencies**: наявні: `Icon` (`check`, `alert`), змінні теми плашки `--good`, `--good-soft`, `--bad`, `--bad-soft`
**Storage**: N/A
**Testing**: `vitest` для `src/desktop/pinStatus.test.ts`; `node --test` у `desktop/` (без нових тестів — зміна в main.cjs лише додає поле); `tsc --noEmit`
**Target Platform**: Windows, плашка поверх гри (темна/світла тема, прозорість)
**Project Type**: desktop-app (Electron) + інтерфейс плашки з коду сайту
**Performance Goals**: N/A (статичний рендер форми)
**Constraints**: поля, кнопки, клавіші форми не змінюються (FR-008); стан розрізняється без кольору (FR-004)
**Scale/Scope**: 1 нова чиста функція + тест, правка `PinAsk`, ~10 рядків CSS, 1 поле в `pin-ask`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише вигляд форми в програмі | ✅ |
| II. Права в базі | Не стосується | ✅ (N/A) |
| III. Знімки приватні | Знімок показується лише в плашці, як зараз | ✅ |
| IV. Перевірені дані | Не змінює, як знаходиться точка | ✅ |
| V. Програма лише додає | Не змінює черги й відправлення | ✅ |
| VI. Тести | Тексти й тон стану — чиста функція з `vitest` | ✅ |

Порушень немає. **Після Phase 1** — без змін, ✅.

## Project Structure

### Documentation (this feature)

```text
specs/080-pin-found-color/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/pin-ask.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
desktop/src/main.cjs          # pin-ask: + kind (код причини), reason лишається
src/desktop/pinStatus.ts      # НОВЕ: pinStatus({ point, player, kind, reason }) → тон, заголовок, текст, підказка
src/desktop/pinStatus.test.ts # НОВЕ: vitest
src/desktop/Bar.tsx           # PinAsk: блок стану + клас рамки знімка; PinAskT + kind?
src/desktop/bar.css           # .bpinst.ok / .bpinst.bad, .bshot.ok img / .bshot.bad img
src/data/changelog.json       # рядок у пак (pending)
```

**Structure Decision**: тексти — у чистій функції поруч із плашкою (`src/desktop/`), як `streamer.ts`; головний процес лише передає код причини.

## Complexity Tracking

Не потрібно — порушень немає.
