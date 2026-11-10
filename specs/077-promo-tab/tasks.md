# Tasks: Промокод Q-Hub над плашкою

**Input**: [plan.md](plan.md), [spec.md](spec.md). Тести обов'язкові.

## Phase 1: Прибрати таймер оголошення

- [x] T001 Видалити `src/desktop/MarketTab.tsx`, функції `market*` і їх тести з `src/lib/alerts.ts` / `src/lib/alerts.test.ts`, канали й тик у `desktop/src/main.cjs`, `desktop/src/preload.cjs`, стилі `.bmk` у `src/desktop/bar.css`, рядки в `src/desktop/Settings.tsx` і `src/data/changelog.json`

## Phase 2: User Story 1 — промокод, коли івентів немає (P1)

- [x] T002 [P] [US1] Тести в `src/lib/alerts.test.ts`: `promoShown` (16 хв до івенту — так, 15 — ні, івент іде — ні), `sitePromo` (вимкнений, порожній, з пробілом — `null`), `promoCommand`
- [x] T003 [US1] `sitePromo`, `promoCommand`, `promoShown` у `src/lib/alerts.ts`
- [x] T004 [US1] `sitePromo()` і `promo` в `bar-data` — `desktop/src/main.cjs`
- [x] T005 [US1] Вкладка промокоду в `Tabs` (`src/desktop/Bar.tsx`), стилі `.bpromo` у `src/desktop/bar.css`, підпис вимикача в `src/desktop/Settings.tsx`
- [ ] T006 Власнику руками: вкладка з'являється й зникає за 15 хв до івенту; клік копіює команду, вона вставляється в чат гри
