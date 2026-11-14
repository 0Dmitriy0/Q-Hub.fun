# Tasks: Мітка Alt+F9 — зелений «знайдено», червоний «не знайдено»

**Input**: Design documents from `specs/080-pin-found-color/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pin-ask.md, quickstart.md

**Tests**: так — конституція, принцип VI (`vitest` для чистої функції стану); research R4.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Тести зелені до змін: `npx.cmd vitest run src/desktop` у корені й `cd desktop && npm.cmd test`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 `desktop/src/main.cjs`, виклик `bar.webContents.send('pin-ask', { … })` (~рядок 745): додати поле `kind: pt ? null : kind` (код з `locatePin`: `'no_map' | 'zoom_in' | 'zoom_out' | 'unsure' | 'no_ref' | 'error'`); `reason` лишити як є (contracts/pin-ask.md)
- [X] T003 `src/desktop/Bar.tsx`, `interface PinAskT` (~рядок 50): додати `kind?: string | null`
- [X] T004 Створити `src/desktop/pinStatus.ts`: `export type PinTone = 'ok' | 'bad'`; `export function pinStatus(a: { point?: { x: number; y: number } | null; player?: boolean; kind?: string | null; reason?: string }): { tone: PinTone; title: string; line: string; help: string }` за data-model.md «Стан форми»: `tone` — `'ok'` ⇔ `point` є; `title` — `ok`+гравець «Нова мітка на мапі», `ok`+адмін «Точку знайдено», `bad` «Точку не знайдено»; `line` — `ok`: `X ${x} · Y ${y}`, `bad`: `Причина: ${reason}` (порожня причина → «Причина: невідомо»); `help` — `ok`+гравець: «Вибери категорію й назви місце — модератор перевірить, і мітку побачать усі. Знімок бачить лише модератор.», `ok`+адмін: «Вибери категорію — адміну буде простіше опублікувати мітку. Повернешся в гру, нічого не вибравши, — точка піде без категорії.» (тексти дослівно як зараз у `PinAsk`); `bad`+гравець: «Без точки мітку не надіслати. » + підказка; `bad`+адмін: «Можна надіслати знімок без точки — її поставить адмін на сайті. Якщо на знімку не карта гри (чат, Discord), не надсилайте. » + підказка. Підказки за `kind` — дослівно research R2 (`no_map`, `zoom_in`, `zoom_out`, `unsure`, `no_ref`, інакше — «Натисніть Alt+F9 ще раз.»). Коментар українською з посиланням на specs/080
- [X] T005 [P] Тести `src/desktop/pinStatus.test.ts` (vitest): точка + гравець → `ok`, «Нова мітка на мапі», `X 12 · Y -34`; точка + адмін → «Точку знайдено»; без точки → `bad`, «Точку не знайдено», `Причина: …`; кожен з 6 кодів дає різну підказку, і кожна закінчується «Alt+F9 ще раз.» (SC-003); невідомий код і `null` → «Натисніть Alt+F9 ще раз.»; гравець без точки — `help` починається з «Без точки мітку не надіслати.»; адмін без точки — містить «надіслати знімок без точки»

**Checkpoint**: `npx.cmd vitest run src/desktop/pinStatus.test.ts` зелений.

---

## Phase 3: User Story 1 — Одразу видно, знайдено точку чи ні (Priority: P1) 🎯 MVP

**Goal**: блок стану зелений/червоний зі значком і рамка знімка того ж кольору.

**Independent Test**: quickstart.md п. 1, 2, 4, 5.

- [X] T006 [US1] `src/desktop/Bar.tsx`, компонент `PinAsk`: замінити трійку `h3`+`p.muted` (гілки `ask.player && ask.point` / `ask.point` / інакше) одним блоком з `pinStatus(ask)`: `<div className={'bpinst ' + st.tone} role="status"><h3><Icon name={st.tone === 'ok' ? 'check' : 'alert'} size={18} />{st.title}</h3><p className="bpinline">{st.line}</p><p className="muted">{st.help}</p></div>`. Координати в `line` — у `<b className="mono">`, як зараз (розбити `line` або передавати x/y окремо — без зміни тексту). До `div.bleft.bshot` додати клас тону: `className={'bleft bshot ' + st.tone}`. Поля, кнопки, `onKey`, тексти кнопок — без змін (FR-008)
- [X] T007 [US1] `src/desktop/bar.css` (біля `.bshot`, ~рядок 135): `.bpinst { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 10px; border-left: 3px solid; }`, `.bpinst.ok { background: var(--good-soft); border-color: var(--good); }`, `.bpinst.bad { background: var(--bad-soft); border-color: var(--bad); }`, `.bpinst h3 { display: flex; align-items: center; gap: 8px; }`, `.bpinst.ok h3 { color: var(--good); }`, `.bpinst.bad h3 { color: var(--bad); }`, `.bpinline { font-size: 13px; color: var(--text); }` (перевірити назву змінної кольору тексту в bar.css), `.bshot.ok img { border: 2px solid var(--good); }`, `.bshot.bad img { border: 2px solid var(--bad); }` (research R3)

**Checkpoint**: обидва стани помітно різного кольору, зі значком (quickstart 1, 2, 5).

---

## Phase 4: User Story 2 — Не знайдено — зрозуміло, що робити далі (Priority: P2)

**Goal**: у червоному блоці — причина й підказка дії; гравцю — що без точки не надіслати; адміну — «надіслати без точки».

**Independent Test**: quickstart.md п. 2, 3; тест T005.

- [X] T008 [US2] Перевірити, що `help` з T004 показується в блоці T006 для `bad` (гравець і адмін), а кнопка «Надіслати без точки» для адміна лишилась (FR-006); для гравця без точки — текст кнопки й поведінка без змін (обмеження «без точки не надіслати» вже діє в `pinDecide`)
- [X] T009 [US2] Перевірити підказку `no_map` про клавішу великої карти: якщо в грі велика карта відкривається не M — прибрати «(M)» з тексту в `src/desktop/pinStatus.ts` і тесті (research R2, «Перевірити»). Без певності — лишити без «(M)»

---

### Додано під час реалізації: гравець без точки

Виявилось (`desktop/src/main.cjs`, ~735): гравцю без точки форма не показується взагалі — лише рядок 12 px унизу плашки, обрізаний «…», на 2,5 с. Саме тому «не знайдено» непомітне. Задачі — в межах FR-002, FR-005 (US1/US2).

- [X] T014 [US1] `desktop/src/main.cjs`: замість `showPin(…, true)` для гравця без точки — `showPinMiss({ kind, reason, preview, mapKey })`: надсилає `pin-miss`, показує плашку без фокусу (`showInactive`, керування лишається в грі), ховає через 6 с, якщо не закріплено; `desktop/src/preload.cjs`: `onPinMiss`
- [X] T015 [US1] `src/desktop/Bar.tsx`: вигляд `pinmiss` — компонент `PinMiss` (знімок у червоній рамці + `PinState` з `pinStatus({ player: true, … })`), спільний `PinState` для `PinAsk` і `PinMiss`
- [X] T016 [US2] `src/desktop/pinStatus.ts`: для гравця без точки підказка закінчується «Або постав мітку на мапі програми — {mapKey}.» (як у старому тексті) + тест

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T010 Журнал: у `src/data/changelog.json` верхній запис пака (`"pending": true`) — додати в `"added"` (або `"changed"`) рядок: «Мітка з гри (Alt+F9): зелений — точку знайдено, червоний — ні, з підказкою, що зробити». Нового запису не створювати
- [X] T011 `npx.cmd vitest run`, `npx.cmd tsc --noEmit -p .`, `cd desktop && npm.cmd test` — зелені
- [X] T012 Димова перевірка `desktop/src/main.cjs` підробленим electron (пам'ять `main-smoke-fake-electron`) — завантажується без помилок
- [ ] T013 Власнику: перевірка в грі за `specs/080-pin-found-color/quickstart.md`

---

## Dependencies & Execution Order

- T001 → (T002 ∥ T003 ∥ T004) → T005 → T006 → T007 → T008 → T009 → T010 → T011–T012 → T013
- T002 (main.cjs), T003 (Bar.tsx тип), T004 (pinStatus.ts) — різні файли, паралельно; T006 і T003 — один файл, по черзі.

## Parallel Example

```text
Після T001:  T002 (desktop/src/main.cjs)  ∥  T004 (src/desktop/pinStatus.ts)
Після T004:  T005 (pinStatus.test.ts)  ∥  T007 (bar.css)
```

## Implementation Strategy

- **MVP**: T001–T007 — колір і значок стану (головне прохання).
- US2 (T008–T009) — підказки дії; тексти вже в T004, тут лише перевірка показу.
- Реліз — у паку (`pending`), за словом власника «випускай».
