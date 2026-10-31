# Tasks: М'ясо — під шкурами, а не посередині

**Input**: [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md)

## Phase 1: Спільне правило

- [X] T001 `src/lib/subOrder.ts`: `subRanks(buyer, subs)` — основна підгрупа (назва скупника → найчисленніша →
  абетка) і `''` → 0, решта → 1, 2… за абеткою (research R2)
- [X] T002 `src/lib/subOrder.test.ts`: «Шкури» основна попри більшість м'яса; без збігу назви — найчисленніша;
  нічия — за абеткою; `''` і невідома — 0; одна підгрупа — лише ранг 0

## Phase 2: US1 — сайт «Ціни» (P1)

- [X] T003 [US1] `sub` у запиті `items(...)`: `src/pages/Prices.tsx` (load) і `scripts/snapshot.mjs`
- [X] T004 [US1] `src/pages/Prices.tsx`: ранги на скупника з усіх рядків (R3); сортування «за назвою» —
  (ранг, назва); інші сортування без змін (FR-003)
- [X] T005 [US1] Підзаголовок підгрупи перед блоком з рангом > 0 лише за сортування «за назвою» (R4), стиль `.psub`
  у `src/styles.css`

## Phase 3: US2 — плашка Alt+Q (P2)

- [X] T006 [US2] `desktop/src/main.cjs` `barPrices`: `items(...,sub)` → поле `sub`
- [X] T007 [US2] `src/desktop/barSearch.ts`: `BarPrice.sub?`, сортування товарів скупника — (склад, ранг, назва)
- [X] T008 [US2] `src/desktop/barSearch.test.ts`: сценарії US2 (порожній склад; м'ясо оленя + груба шкура кабана)

## Phase 4: Завершення

- [X] T009 `src/data/changelog.json` — запис `2026-10-31.2` (плашка)
- [X] T010 `tsc --noEmit`, `vitest run`; spec.md → Implemented
