# Tasks: Сповіщення «час здавати» (+ спільна основа етапу 1)

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ipc-alerts.md](contracts/ipc-alerts.md)

Тести обов'язкові (запит власника). Спільна основа (фази 1–2) потрібна також 076 і 077.

## Phase 1: Setup

- [x] T001 Друга точка входу збірки: `src/lib/alerts.ts` → `desktop/src/lib/alerts.cjs` у `vite.lib.config.ts` (поруч із `shotparse.cjs`)

## Phase 2: Foundational

- [x] T002 `notify({ title, body }, onClick)` у `desktop/src/main.cjs`: `Notification` з іконкою, посилання тримається до закриття; наявні два сповіщення про оновлення — через нього
- [x] T003 Тик сповіщень раз на 20 с (`startAlerts`) і стан `settings.alertSent` у `desktop/src/main.cjs`
- [x] T004 [P] Розділ «Сповіщення» в `src/desktop/Settings.tsx` (NAV, кнопка «Перевірити сповіщення») + канал `notify-test` у `desktop/src/main.cjs` і `desktop/src/preload.cjs`

## Phase 3: User Story 1 — сповіщення про високу ціну (P1)

**Independent Test**: позначений товар зі свіжою ціною ≥ 80% дає одне сповіщення за ≤ 5 хв.

- [x] T005 [P] [US1] Тести `sellDue` у `src/lib/alerts.test.ts`: ≥ 80% і свіжа → сповіщення; та сама ціна — мовчить; інша ціна до 30 хв — мовчить, після — сповіщає; впала й піднялась — сповіщає після 30 хв; стара (> 3 год) і без меж — ніколи; кілька товарів — одне сповіщення; найкращий із двох скупників
- [x] T006 [US1] `sellDue(watch, prices, sent, now)` і текст сповіщення в `src/lib/alerts.ts` поверх `advise` (`SELL_GAP = 30 хв`, `GOOD`, `STALE` — з `pricestats.ts`)
- [x] T007 [US1] Перевірка цін у тику `desktop/src/main.cjs`: раз на 5 хв свіжий `barPrices`, лише коли `sellAlert`, список не порожній і є сесія; `alertSent.sell` зберігається

## Phase 4: User Story 2 — вибір товарів і вимикач (P1)

**Independent Test**: позначка переживає перезапуск; вимикач зупиняє сповіщення.

- [x] T008 [US2] `settings.watch` («`number[]` — id товарів, ≤ 50»), канали `watch-toggle`, `watch-clear`, `watch` у `bar-data`, `sellAlert` у `barPrefs` («типово `true`») — `desktop/src/main.cjs`, `desktop/src/preload.cjs`
- [x] T009 [P] [US2] Тест `watchToggle` (додати, зняти, межа 50) у `src/lib/alerts.test.ts` і функція в `src/lib/alerts.ts`
- [x] T010 [US2] Дзвіночок у `Prices` (`src/desktop/barParts.tsx`, необов'язкові `watch` / `onWatch` — демо на сайті без нього), дані в `src/desktop/Bar.tsx`, стилі в `src/desktop/bar.css`
- [x] T011 [US2] У «Сповіщення»: вимикач «Час здавати», «стежиш за N товарами», «Очистити список», підказка для порожнього списку — `src/desktop/Settings.tsx`

## Phase 5: Polish (на весь етап)

- [x] T012 Аудит `desktop/src`: дрібне виправити з тестом, велике — у `docs/PLAN.md` → «Що лишилось»
- [x] T013 Один запис у `src/data/changelog.json` на весь етап, `"version": "0.8.0"`; `desktop/package.json` → 0.8.0
- [x] T014 `npm.cmd test` у корені й у `desktop/`, `npm.cmd run build:app`
- [ ] T015 Власнику руками: чекліст із [quickstart.md](quickstart.md) у грі

## Dependencies

T001 → T006/T007; T002, T003 → T007; T008 → T010, T011. 076 і 077 залежать від фаз 1–2 цього файла.

## Implementation Strategy

MVP — фази 1–4 (US1 + US2 разом: без вибору товарів сповіщати нема про що).
