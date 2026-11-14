---
description: "Task list: Гарний і читабельний текст відповідей"
---

# Tasks: Гарний і читабельний текст відповідей

**Input**: `specs/085-readable-answers/` — plan.md, spec.md, research.md, data-model.md, contracts/rich-text.md, quickstart.md

**Tests**: так — конституція, принцип VI: чиста логіка (розбір тексту) MUST мати модульні тести (`vitest`).

**Organization**: за історіями зі spec.md (US1, US2 — P1; US3 — P2).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Переконатися, що `npx.cmd vitest run src/desktop/barParts.test.ts supabase/functions/assistant/plan.test.ts` зелений до змін (база для порівняння); якщо `supabase/functions/**` не входить у vitest — записати, якою командою його запускає CI (`.github/workflows/deploy.yml`), і використовувати її в T005/T021

---

## Phase 2: Foundational (блокує всі історії)

**Мета**: розбирач легкої розмітки й компонент `<Rich>` — ними користуються US1, US2, US3.

- [X] T002 [P] Написати тести `src/desktop/richText.test.ts` (спершу червоні) за data-model.md: (а) «Порожні рядки поспіль = один розрив між блоками; порожніх блоків немає»; (б) рядки з `- `, `• `, `* ` → `list` ordered=false, з `1. `/`1) ` → ordered=true; «Тип списку визначає перший пункт; змішані маркери поспіль — той самий список»; (в) «Рядок без маркера одразу після пункту списку закриває список і починає абзац»; (г) `**5 000 $**` → span bold без зірочок; «`**…**` без пари — звичайний текст разом із зірочками»; (ґ) «`#`, `##`, `###` на початку рядка — зрізаються»; (д) «Вхід порожній → `[]`; вхід без структури → один `para`»; (е) кілька рядків підряд без маркера — один `para` з переносом між ними; (є) `plainText`: абзаци через `\n\n`, пункти `• ` / `N. `, жирне без `**`, «(Кримінальний кодекс, ст. 6.5)» лишається; результат ніколи не містить `**`; (ж) не кидає винятків на рядках з самих зірочок, `\r\n`, дуже довгих словах
- [X] T003 Створити `src/desktop/richText.ts` за contracts/rich-text.md §2: типи `Span`, `Block`, функції `parseRich(text: string): Block[]` і `plainText(text: string): string` (чисті, без React, нормалізують `\r\n`); довести T002 до зеленого
- [X] T004 Додати компонент `Rich({ text, cite = true, clamp })` у `src/desktop/barParts.tsx` (contracts/rich-text.md §3): `<div className={'rich' + (clamp ? ' clamp' : '')}>`, блок `para` → `<p>` (переноси всередині — `<br/>`), `list` → `<ul>`/`<ol>` з `<li>`, span bold → `<strong>`; кожен текстовий шматок при `cite` — через наявний `cites()`; лише React-вузли, без `dangerouslySetInnerHTML`; `key` за індексами
- [X] T005 Базові стилі `.rich` у `src/desktop/bar.css` (research.md R4): `line-height: 1.6`, `max-width: 75ch`, `overflow-wrap: anywhere`; `.rich p { margin: 0 }`, `.rich > * + * { margin-top: .55em }`; `.rich ul, .rich ol { margin: 0; padding-left: 1.2em }`, `.rich li + li { margin-top: .3em }`, `.rich li::marker { color: var(--accent); font-weight: 700 }`; `.rich strong { font-weight: 700; color: var(--fg) }`; `.rich.clamp { max-height: calc(1.6em * 4); overflow: hidden; -webkit-mask-image: linear-gradient(#000 60%, transparent); mask-image: linear-gradient(#000 60%, transparent) }`; додати `.rich` до правила `user-select: text; cursor: text` (`bar.css:338`)

**Checkpoint**: `richText.test.ts` зелений; `<Rich>` готовий до використання.

---

## Phase 3: User Story 1 — Відповідь ШІ читається з першого погляду (P1) 🎯 MVP

**Goal**: відповідь ШІ — абзаци, списки, жирне, позначки пунктів; копіюється чистим текстом.

**Independent Test**: Shift+Enter «що буде за угон авто» → головна думка першим реченням, далі список, суми жирні, зірочок немає; «Копіювати» → у Блокноті без `**`.

### Tests for User Story 1

- [X] T006 [P] [US1] Додати перевірки в `supabase/functions/assistant/plan.test.ts`: `SYSTEM` містить вимогу «головна думка — першим реченням», формат списку «- » з нового рядка, «**жирне**» лише для сум і строків (не більше трьох), заборону заголовків і таблиць; і далі містить `'(Кримінальний кодекс, ст. 6.5)'` та `"з пам'яті не вигадуй"`; прибрати/оновити перевірки старого «одне-два короткі речення», якщо є

### Implementation for User Story 1

- [X] T007 [US1] Оновити `SYSTEM` у `supabase/functions/assistant/plan.ts` (research.md R2): замість «Відповідай звичайним текстом: одне-два короткі речення…» — «Перше речення — головна думка (так чи ні, сума, строк). Якщо пунктів два й більше — далі список: кожен пункт з нового рядка з «- ». **Жирним** виділяй лише суми, строки й ключове слово — не більше трьох на відповідь. Без заголовків, таблиць і вкладених списків. Про ціни — одне-два речення.»; у пункті про правила «суть і покарання, до чотирьох речень» → «суть першим реченням, далі до чотирьох пунктів списком», посилання «(документ, п. N)» — у кінці пункту; решту тексту (сленг, search_rules, заборона вигадувати) не чіпати; довести T006 до зеленого
- [X] T008 [US1] У `src/desktop/Bar.tsx` (~рядок 320) замінити `<div className="bans">{cites(a.reply)}<CopyBtn icon text={a.reply} …/></div>` на `<div className="bans"><Rich text={a.reply} /><CopyBtn icon text={plainText(a.reply)} label="Копіювати відповідь" /></div>`; імпорти `Rich` з `./barParts`, `plainText` з `./richText`; прибрати імпорт `cites`, якщо більше не потрібен
- [X] T009 [US1] Стилі відповіді в `src/desktop/bar.css`: `.bans` лишає картку з помаранчевою рискою, `font-size: 15.5px`; перше речення не виділяти окремо (головну думку дає модель); `.bans .bcite` — `white-space: nowrap` лише для коротких (≤ 40 знаків) — або замінити на `white-space: normal; box-decoration-break: clone; -webkit-box-decoration-break: clone`, щоб довга позначка не розширювала панель (Edge Case «довге слово»)
- [X] T010 [US1] Перевірити, що відповіді з «Історії» (`src/desktop/History.tsx` та вибір рядка в `Bar.tsx`) показуються через той самий шлях `.bans` → `<Rich>`; якщо `History.tsx` має власний показ тексту ШІ — замінити його на `<Rich text={…} />` (FR-012)
- [X] T011 [US1] Помилка ШІ (`a.error`, `<p className="bad">`) лишається без `<Rich>` — перевірити, що не зачеплено (Edge Case)

**Checkpoint**: US1 працює в плашці (без деплою — старі відповіді з абзацами; після деплою `assistant` — зі списками).

---

## Phase 4: User Story 2 — Картки правил легше пробігати очима (P1)

**Goal**: ієрархія номер → заголовок → текст → покарання; підпункти з нового рядка; межа між картками очевидна.

**Independent Test**: Enter «каф» → у кожній картці номер і покарання видно за ≤ 2 с; довгий пункт згорнутий зі згасанням, «Показати повністю» розгортає.

- [X] T012 [US2] У `RuleCard` (`src/desktop/barParts.tsx:62`) замінити `<p className={long && !open ? 'clamp' : ''}>{body}</p>` на `<Rich text={body} cite={false} clamp={long && !open} />`; поріг `long` (`body.length > 260 || рядків > 4`) лишити
- [X] T013 [US2] Ієрархія картки в `src/desktop/bar.css` (FR-009): `.brule .rich { font-size: 15px }` (було 14.5px у `.brule p`); `.brule` — `gap: 8px`, `padding: 12px 14px 13px`; `.bpen` — `display: flex; align-items: flex-start; gap: 6px; align-self: stretch` з лівою рискою `border-left: 3px solid var(--bad)` (покарання візуально відокремлене від тексту); `.brule p.bextra` → `.brule .bextra` зберегти `--muted`, 12.5px; `.brules { gap: 10px }`; `.brule:hover { border-color: var(--line2) }` для межі між картками
- [X] T014 [US2] Оновити селектори, що чіпали `.brule p` (`bar.css:96–97`, `:338`, `.rwin.free .rwin-rule p` `:409`), щоб вони діяли на `.rich` (і `user-select: none` при перетягуванні в окремому вікні — на `.rwin.free .rwin-rule .rich`); старе правило `.brule p.clamp` видалити
- [X] T015 [P] [US2] Перевірити в `src/desktop/barParts.test.ts`, що `ruleText`/`rulesText` (копіювання пункту) не змінились; якщо тексти правил містять `**` чи маркери — копіювання пункту лишити як є (сирий текст правил не розмітка ШІ)
- [X] T016 [US2] Перевірити демо на сайті (`src/components/BarDemo.tsx:128` — `RuleCard`): картки в новому вигляді, без горизонтальної прокрутки на ширині 375px (FR-014)

**Checkpoint**: US1 + US2 працюють незалежно.

---

## Phase 5: User Story 3 — Той самий вигляд в окремому вікні правил (P2)

**Goal**: «Окремо» показує той самий вигляд, що й плашка; читається поверх світлої сцени.

**Independent Test**: відповідь ШІ → «Окремо» → закрити Alt+Q → у вікні абзаци, списки, жирне й позначки пунктів.

- [X] T017 [US3] У `src/desktop/RuleWin.tsx:129` замінити `<p>{ai ? cites(body) : body}</p>` на `<Rich text={body} cite={ai} />`; імпорт `Rich` з `./barParts`, прибрати `cites` з імпорту, якщо не потрібен
- [X] T018 [US3] Стилі вікна в `src/desktop/bar.css` (`.rwin-rule`, ~рядок 405): `.rwin-rule .rich { font-size: 15px }`, ширина рядка — як у плашці; фон `.rwin` (`rgba(14,18,24,.96)`) лишити — контраст `--fg` ≥ 4,5 : 1 і поверх світлої сцени (FR-008)

**Checkpoint**: усі три історії працюють.

---

## Phase 6: Polish & Cross-Cutting

- [X] T019 [P] Перевірити контраст (skill `a11y-enforcer:contrast` або розрахунок): `--fg`, `--muted`, `--faint`, `.bpen` (`--bad` на `--bad-soft`), маркер `li::marker` (`--accent`) на `#18212d` і на фоні `.rwin`; основний ≥ 4,5 : 1, другорядний ≥ 3 : 1 (SC-004); за потреби підняти колір лише в межах цих правил
- [X] T020 [P] Додати рядок у верхній запис з `"pending": true` у `src/data/changelog.json` (група `changed`, мовою гравця): «Відповіді ШІ й пункти правил стали читабельнішими: абзаци, списки, головне — жирним; копіюється без зайвих символів»
- [X] T021 Прогнати `npx.cmd vitest run` (усі тести) і `npx.cmd tsc --noEmit` (або команду з CI); виправити червоне
- [X] T022 Зібрати й перезапустити програму (закрити Q-Hub власника, `cd desktop && npm.cmd start`) і пройти quickstart.md §2 (кроки 1–5); перевірити, що в бандлі немає старих `.js`-копій, що підміняють `.tsx`
- [X] T023 Задеплоїти функцію асистента `supabase functions deploy assistant --yes` — лише з погодження власника; після деплою повторити quickstart.md §2 крок 1 на 10 питаннях (угон, каф, арешт, зірки, штрафи…) для SC-001/SC-002

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** → далі історії.
- **Phase 2 (T002–T005)** блокує US1, US2, US3.
- **US1 (T006–T011)**, **US2 (T012–T016)**, **US3 (T017–T018)** — незалежні між собою після Phase 2; але всі правлять `src/desktop/bar.css`, тож стильові задачі (T009, T013, T014, T018) робити послідовно.
- **T007** (промпт) не залежить від інтерфейсу — можна паралельно з Phase 2.
- **Polish** — після бажаних історій; T023 — останнім.

## Parallel Opportunities

- T002 (тести) ∥ T006 (тести промпту) ∥ T007 (промпт) — різні файли.
- Після Phase 2: T008 (Bar.tsx) ∥ T012 (barParts.tsx RuleCard) ∥ T017 (RuleWin.tsx).
- T019 ∥ T020.

### Приклад для US1

```text
T006 plan.test.ts  ∥  T008 Bar.tsx
потім T007 plan.ts → T009 bar.css → T010–T011 перевірки
```

## Implementation Strategy

### MVP (US1)

1. Phase 1–2 → 2. Phase 3 (US1) → 3. перевірка в програмі → можна злити в пак уже з цим.

### Далі

US2 (картки) → US3 (окреме вікно) → Polish → деплой `assistant` з погодження власника. Реліз — разом з паком 0.9.0, коли власник скаже «випускай».
