# Tasks: Правдивий склад і зручніший облік

**Input**: Design documents from `specs/030-stock-ledger/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bar-sale.md, quickstart.md

**Tests**: потрібні — конституція, принцип VI (тести на логіку). Тест пишеться перед кодом і спершу падає.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Звірити гілку `030-stock-ledger` з `main` і переконатися, що `npx.cmd vitest run` і `cd desktop && npm.cmd test` зелені до змін; не запускати `tsc -b` (кладе `.js` поруч з `.ts`) — лише `npx.cmd tsc --noEmit`

---

## Phase 2: Foundational (блокує US1)

- [ ] T002 Виправити видалення угоди в `src/pages/cabinet/DealsPage.tsx` (рядок ~49): запис `transactions` за `d.tx_id` видаляти лише тоді, коли його `source = 'deal'` (прочитати `source` перед видаленням); інакше запис про гроші лишається (research R5, FR-003a)
- [ ] T003 У `desktop/src/main.cjs` `autoRecords`: вставка «tx» повертає `id` (`.insert(...).select('id').single()`); функція повертає масив `{ rec, txId }` для записів з `type: 'in'`, без зміни поведінки для решти

**Checkpoint**: облік пишеться як раніше; видалення угоди з `tx_id` на автозапис не стирає гроші.

---

## Phase 3: User Story 1 — Продаж скупнику сам пропонує списати товар (P1) 🎯 MVP

**Goal**: після автоматичного «Продаж фарму» плашка пропонує списання; Enter пише угоди з `tx_id` наявного запису; «Скасувати» 10 с.

**Independent Test**: quickstart кроки 1–5.

### Tests

- [ ] T004 [P] [US1] `src/lib/saleGuess.test.ts`:
  - один товар без остачі → `{ kind: 'one' }`;
  - дві кратні ціни (10 × 475 = 19 × 250) → `manual`;
  - товар зі складу має пріоритет над товаром без складу;
  - «Продати все» (сума = Σ склад × ціна, ≥ 2 товари) → `all`;
  - нестача (`qty > stock`) → `farm = qty − stock`;
  - товар без складу → `farm = qty`;
  - кг: 12,5 кг × 80 = 1 000 → `qty 12.5`;
  - сума не ділиться → `manual`, спершу товари зі складу.
- [ ] T005 [P] [US1] `desktop/src/salequeue.test.cjs`: черга пропозицій.
  - `add` за `txId` без дублів;
  - TTL 10 хв → `expired`;
  - `confirm` → `undo` дозволено ≤ 10 с, після — відмова;
  - перевірка рядків: `qty > 0`, `0 ≤ farm ≤ qty`, `price ≥ 0`, `item` 1–80 символів, «Σ (qty × price) має дорівнювати amount з точністю до 1 $».

### Implementation

- [ ] T006 [P] [US1] `src/lib/saleGuess.ts`: `saleGuess(amount, items: { item; price }[], stock: Record<string, number>)` → `{ kind: 'one' | 'all', lines: { item; qty; price; farm }[] } | { kind: 'manual', items: { item; price; have }[] }` за research R3 (поділ без остачі; для кг — точність 0,01)
- [ ] T007 [P] [US1] `desktop/src/salequeue.cjs`: черга пропозицій.
  - Стан `pending → confirmed | declined | expired (10 хв)`, `confirmed → undone` ≤ 10 с.
  - `validate(lines, amount)` за contracts/bar-sale.md.
  - Модуль без Electron, щоб тест не тягнув програму.
- [ ] T008 [US1] `desktop/src/vision.cjs`: ціни скупника для пропозиції.
  - Після `scanPrices` зберігати `lastRead[buyer] = { at, prices: { item_id → price } }` з розпізнаних рядків (`rows`).
  - До записів з `category === 'Продаж фарму'` додавати `buyer_id` і `prices`, якщо `place.kind === 'buyer'` і вікно читалось ≤ 10 хв тому (research R2).
- [ ] T009 [US1] `desktop/src/main.cjs`: продаж → пропозиція.
  - `autoRecords` для «Продаж фарму» з `txId` кладе пропозицію в чергу (`salequeue`).
  - `bar-data` віддає `sales` (усі `pending`, з назвою скупника).
  - Якщо плашка відкрита — подія `sale-new`.
- [ ] T010 [US1] `desktop/src/main.cjs`: IPC з contracts/bar-sale.md, лише `fromBar(e)`.
  - `sale-confirm(txId, lines)`: перевірка → угоди `deals`: `farm` з `price 0` і часом на 1 мс раніше, потім `sell`, усі з `tx_id = txId`; помилка посередині → видалити вставлені угоди цього `txId`.
  - `sale-decline(txId)`.
  - `sale-undo(txId)`: видалити лише угоди з `tx_id = txId`, ≤ 10 с; запис обліку не чіпати.
- [ ] T011 [US1] `desktop/src/preload.cjs`: `saleConfirm`, `saleDecline`, `saleUndo`, підписка `onSaleNew`
- [ ] T012 [US1] `src/desktop/SaleCard.tsx` + підключення в `src/desktop/Bar.tsx` (як `UpdateBanner`).
  - **Один товар чи «усе»**: картка над рядком «Продав 10 × Шкура оленя по 475 $» або «Нафармив і продав …», Enter — так, Esc — ні.
  - **`manual`**: вибір товару (спершу «є на складі») і поле кількості.
  - **Після Enter**: «Скасувати» 10 с.
  - Кандидат рахує `saleGuess`: ціни з `sale.prices`, інакше з `barPrices` цього скупника; склад — `barStock`.
- [ ] T013 [US1] `src/desktop/bar.css`: стилі `SaleCard` у темі плашки
- [ ] T014 [US1] `src/data/changelog.json`: запис дня (новий id, якщо попередній уже в `main`) — «added»: продаж скупнику пропонує списати товар зі складу

**Checkpoint**: quickstart 1–5 проходять; облік не задвоюється.

---

## Phase 4: User Story 2 — Склад підказує, що з ним робити (P2)

**Goal**: по кожному товару — собівартість, вартість зараз, прибуток, найкращий скупник, «краще почекати»; окремий блок «Не купує жоден скупник».

**Independent Test**: quickstart крок 6.

- [ ] T015 [P] [US2] `src/lib/advice.test.ts`: `wait` при `pos < 40`; `unsold` — товари без жодного скупника з `qty` і `cost`; нафармлене (`boughtQty = 0`) → `profit null`
- [ ] T016 [US2] `src/lib/advice.ts`: `export const WAIT = 40`; `Advice.wait`; нова `unsold(held, prices)`
- [ ] T017 [US2] `src/pages/cabinet/StockPage.tsx`: таблиця «На складі».
  - Стовпці: собівартість, «зараз» (найкращий скупник і ціна), прибуток (`signed`, для нафармленого — «увесь дохід»), позначки «краще почекати» і «ціна може бути застаріла».
  - Нижче — блок «Не купує жоден скупник».
- [ ] T018 [US2] `src/styles.css`: стилі нових стовпців і блоку; на телефоні таблиця прокручується, як зараз (`.scroll`)

**Checkpoint**: склад радить; дашборд показує те саме, що й раніше.

---

## Phase 5: User Story 3 — Облік: знайти запис і зрозуміти, звідки гроші (P3)

**Goal**: фільтри історії й сума, вивантаження CSV, чистий за годину за категоріями.

**Independent Test**: quickstart крок 7.

- [ ] T019 [P] [US3] `src/lib/txFilter.test.ts`: категорія, рахунок, період, `auto` (`source ∈ {desktop, reconcile}`), `manual`, сума відфільтрованого (прибуток, витрати, чистий)
- [ ] T020 [P] [US3] `src/lib/txCsv.test.ts`: BOM, `;`, екранування `"` і `;` у нотатці, дата `ДД.ММ.РРРР ГГ:ХХ` (Київ), стовпці «Дата; Тип; Сума; Категорія; Рахунок; Нотатка; Джерело»
- [ ] T021 [P] [US3] `src/lib/perHourByCat.test.ts`:
  - проміжок від попереднього запису в межах сесії;
  - перший запис — від початку сесії;
  - > 30 хв не рахується;
  - запис поза сесією — без часу;
  - перекази й коригування нічого не отримують, але скидають відлік;
  - < 15 хв → `perHour null`.
- [ ] T022 [P] [US3] `src/lib/txFilter.ts` за data-model «Фільтр історії»
- [ ] T023 [P] [US3] `src/lib/txCsv.ts` + `downloadCsv(name, text)` через `Blob` і `<a download>` (research R7)
- [ ] T024 [P] [US3] `src/lib/perHourByCat.ts` за research R6
- [ ] T025 [US3] `src/pages/cabinet/LedgerPage.tsx`: панель фільтрів над «Історією» (категорія — `Select`, рахунок і джерело — `seg`, період — наявні `PERIODS`), сума відфільтрованого, кнопка «Вивантажити».
  - Фільтри й вивантаження працюють і на сайті: не `edit-only`, поза `fieldset disabled` або з `disabled={false}` (FR-009).
- [ ] T026 [US3] `src/pages/cabinet/LedgerPage.tsx` «Підсумки»: таблиця «Чистий за годину за видами» з `perHourByCat`; `null` → «замало даних»; підпис «наближення: час між записами програми»
- [ ] T027 [US3] `src/data/changelog.json`: доповнити запис з T014 — «added»: фільтри історії, вивантаження, «чистий за годину» за видами

---

## Phase 6: Polish

- [ ] T028 `npx.cmd tsc --noEmit`, `npx.cmd vitest run`, `cd desktop && npm.cmd test` — усе зелене
- [ ] T029 Перевірити кабінет на сайті (тільки перегляд): фільтри й CSV працюють, кнопок списання й правок немає
- [ ] T030 `docs/PLAN.md`: позначити specs/030; `specs/030-stock-ledger/spec.md` Status → Implemented після перевірки власником (quickstart у грі)

---

## Dependencies

- Phase 2 (T002, T003) → US1.
- US2 і US3 від US1 не залежать, тож їх можна робити паралельно з US1 або в будь-якому порядку.
- **US1**: T004, T005 → T006, T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014.
- **US2**: T015 → T016 → T017 → T018.
- **US3**: T019–T021 → T022–T024 → T025 → T026 → T027 (T027 після T014: той самий запис журналу).

## Parallel Example

```text
US1: T004 saleGuess.test.ts  ‖  T005 salequeue.test.cjs, потім T006 saleGuess.ts  ‖  T007 salequeue.cjs
US3: T019 ‖ T020 ‖ T021, потім T022 ‖ T023 ‖ T024
```

## Implementation Strategy

1. **MVP = Phase 2 + US1.** Склад стає правдивим, і лише після цього поради складу (US2) мають сенс. Показати власнику, перевірити quickstart 1–5 у грі.
2. **US2**: мала, переважно підключення наявної `advise()`.
3. **US3**: незалежна, найменш ризикова.
