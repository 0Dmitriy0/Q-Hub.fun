# Implementation Plan: Точніші координати мітки Alt+F9

**Branch**: `088-pin-accuracy` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/083-pin-accuracy/spec.md`

## Summary

Заміри на 39 перевірочних знімках (research R1): на 50–600 м більшість точок у межах 0–7 м, але 6 викидів 10–24 м; на 600–1100 м — 10–28 м; на 56–69 м 4 з 5 знімків — «не впевнений». Причини: найдрібніший крок зіставлення — 8 м/пікс навіть на близькому масштабі, і великий шаблон (~1 км), де похибка прочитаного масштабу зсуває точку пропорційно відстані від хрестика. Рішення (P1): третій етап у `locate()` — уточнення біля хрестика на дрібному кроці (1–4 м/пікс за масштабом), з малим вікном навколо хрестика й підбором масштабу ±4 %; якщо третій етап суперечить другому чи не впевнений — «не впевнений». P2: у зеленій формі мітки — шматок мапи Q-Hub (3×3 плитки z6) з позначкою знайденої точки; розрахунок плиток — чиста функція з тестом.

## Technical Context

**Language/Version**: JavaScript CommonJS (`desktop/src/mapmatch.cjs`, воркер `mapmatch.worker.cjs`), TypeScript + React (форма мітки в плашці)
**Primary Dependencies**: наявні: власний FFT/NCC у `mapmatch.cjs`, еталон `export.bin`, плитки мапи `/map/{z}/{x}/{y}.webp` (`mapUrl` у `src/lib/mapGeo.ts`)
**Storage**: N/A
**Testing**: `node --test` — `desktop/src/mapmatch.test.cjs` на `fixtures/map` (39 кадрів) з новими порогами точності; `vitest` — розрахунок плиток прев'ю
**Target Platform**: Windows, Electron, гра 1920×1080 (інші роздільні — та сама логіка масштабу)
**Project Type**: desktop-app
**Performance Goals**: час Alt+F9 → форма — як зараз (+ ≤ 300 мс на третій етап; заміряти в тесті)
**Constraints**: жодної хибної точки (далі 50 м) — конституція, принцип IV; частка знайдених на 100–1000 м — не менше 28/29
**Scale/Scope**: ~60 рядків у `mapmatch.cjs` + пороги в тесті; прев'ю — компонент у `Bar.tsx`, чиста функція `src/desktop/pinPreview.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише знімок екрана, як зараз | ✅ |
| II. Права | Не змінюються | ✅ (N/A) |
| III. Знімки приватні | Нові перевірочні знімки — лише власні, без чату й чужих ніків (README набору) | ✅ |
| IV. Перевірені дані | Сумнівне → «не впевнений»; тест: 0 точок далі 50 м | ✅ |
| V. Програма лише додає | Черга й надсилання не змінюються | ✅ |
| VI. Тести | Пороги точності — у `mapmatch.test.cjs` на справжніх кадрах; плитки — `vitest` | ✅ |

Порушень немає. **Після Phase 1** — без змін, ✅.

## Project Structure

### Documentation (this feature)

```text
specs/083-pin-accuracy/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/locate.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
desktop/src/mapmatch.cjs        # locate(): етап 3 «біля хрестика» (дрібний крок, мале вікно, підбір масштабу)
desktop/src/mapmatch.test.cjs   # нові пороги: 100–600 м ≥90 % ≤10 м, 0 >20 м; 600–1000 м ≥90 % ≤20 м; 0 >50 м; час
desktop/src/fixtures/map/       # + нові власні кадри 50–100 м (від власника)
src/desktop/pinPreview.ts       # НОВЕ: плитки z6 навколо точки + зсув позначки
src/desktop/pinPreview.test.ts  # НОВЕ: vitest
src/desktop/Bar.tsx             # PinAsk: прев'ю мапи поруч зі знімком (зелений стан)
src/desktop/bar.css             # стилі прев'ю
src/data/changelog.json         # рядок у пак (pending)
```

**Structure Decision**: алгоритм лишається в чистому `mapmatch.cjs` (вже з тестами на справжніх кадрах); прев'ю — чиста функція поруч з плашкою.

## Complexity Tracking

Не потрібно — порушень немає.
