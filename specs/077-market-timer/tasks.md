# Tasks: Таймер оголошення на маркеті

**Input**: [plan.md](plan.md), [spec.md](spec.md); спільна основа — фази 1–2 у [specs/075-sell-alert/tasks.md](../075-sell-alert/tasks.md).

Тести обов'язкові.

## Phase 3: User Story 1 — запустити й бачити залишок (P1)

**Independent Test**: таймер на 2 год показує правильний залишок після закриття й відкриття плашки.

- [x] T001 [P] [US1] Тести в `src/lib/alerts.test.ts`: `marketHours` (1, 48, '24', ' 5 ' — так; 0, 49, 1.5, '', 'abc', null — ні); `marketStart`; `marketLeft` («ще 5 год 12 хв», «завершилось»)
- [x] T002 [US1] `marketHours`, `marketStart`, `marketLeft` у `src/lib/alerts.ts` (`MARKET_MIN = 1`, `MARKET_MAX = 48`)
- [x] T003 [US1] `settings.market` («`{ [characterId]: { hours, ends: ms, warned, done } }`»), канали `market-set` / `market-clear`, `market` у `bar-data` — `desktop/src/main.cjs`, `desktop/src/preload.cjs`
- [x] T004 [US1] `src/desktop/MarketTab.tsx`: кнопка → поле годин (Enter — запустити, Esc — закрити, помилка «Від 1 до 48 годин») → залишок із хрестиком; вкладки над плашкою в `src/desktop/Bar.tsx`, стилі в `src/desktop/bar.css`

## Phase 4: User Story 2 — сповіщення (P1)

**Independent Test**: таймер на 2 год дає «лишилась година» й «завершилось», кожне один раз.

- [x] T005 [P] [US2] Тести `marketDue` і `marketNote` у `src/lib/alerts.test.ts`: за годину — `warn` один раз; таймер на 1 год — без `warn`; кінець — `done` один раз; персонаж у тексті
- [x] T006 [US2] `marketDue`, `marketNote` у `src/lib/alerts.ts` (`MARKET_WARN = 1 год`)
- [x] T007 [US2] Виклик у тику `desktop/src/main.cjs` для таймерів усіх персонажів; «Оголошення завершилось» у `src/desktop/MarketTab.tsx`

## Phase 5: User Story 3 — переживає перезапуск (P1)

**Independent Test**: після перезапуску залишок менший рівно на час простою.

- [x] T008 [P] [US3] Тести в `src/lib/alerts.test.ts`: кінець настав «поки не працювала» → `done` з `late`; запуск за 25 хв до кінця без `warn` → `warn` з «лишилось 25 хв»; уже надіслане не повторюється
- [x] T009 [US3] Прибирання в `desktop/src/main.cjs`: таймери видалених персонажів і завершені старші 7 днів

## Dependencies

075 (фази 1–2) → T003, T007. T002 → T003 → T004; T006 → T007.
