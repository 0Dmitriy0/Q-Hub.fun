# Tasks: Нагадування про івенти

**Input**: [plan.md](plan.md), [spec.md](spec.md); спільна основа — фази 1–2 у [specs/075-sell-alert/tasks.md](../075-sell-alert/tasks.md) (збірка `alerts.cjs`, `notify`, тик, розділ «Сповіщення»).

Тести обов'язкові.

## Phase 3: User Story 1 — не проґавити івент (P1)

**Independent Test**: вибраний івент дає одне сповіщення за 10 хв до старту.

- [x] T001 [P] [US1] Тести `eventDue` у `src/lib/alerts.test.ts`: за 10 хв — сповіщення; за 11 хв — ні; повторний тик і «перезапуск» з тим самим `sent` — ні; запуск за 4 хв до старту — «через 4 хв»; івент уже йде — ні; Лотерея + Перегони — одне сповіщення; невибраний івент — ні; час у тексті київський (тест на мітці часу UTC)
- [x] T002 [US1] `eventDue(ids, sent, now)` і текст у `src/lib/alerts.ts` поверх `eventStatus` (`EVENT_LEAD = 10 хв`, вікно об'єднання 3 хв)
- [x] T003 [US1] Виклик у тику `desktop/src/main.cjs`, `alertSent.events` зберігається; клік по сповіщенню відкриває плашку

## Phase 4: User Story 2 — вибір івентів і вимикач (P1)

**Independent Test**: вибір зберігається між запусками; вимкнено — тиша.

- [x] T004 [US2] `eventAlert` («`boolean`, типово `false`») і `eventIds` («`string[]` з id `EVENTS`, типово `['ufo']`») у `BAR_DEFAULTS` і `barPrefs` (`desktop/src/main.cjs`): невідомі id відкидаються
- [x] T005 [P] [US2] Тест `eventIds` (фільтр невідомих, без повторів) у `src/lib/alerts.test.ts` і функція в `src/lib/alerts.ts`
- [x] T006 [US2] У «Сповіщення» (`src/desktop/Settings.tsx`): вимикач «Нагадувати про івенти», кнопки івентів з розкладом, підказка «вибери івенти»; тип `Prefs` у `src/desktop/Bar.tsx`

## Dependencies

075 (фази 1–2) → T002, T003, T006. T004 → T006.
