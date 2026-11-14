# Implementation Plan: Таймер заробітку на роботі

**Branch**: `092-job-earnings-timer` (спека — `086-job-earnings-timer`) | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/086-job-earnings-timer/spec.md`

## Summary

Ручний таймер заробітку: Alt+T (чи кнопка в плашці) відкриває маленьке вікно поверх гри, яке рахує чистий час, суму зростань балансу HUD і $/год; пауза, стоп, підпис роботою, історія з середнім по роботі; вимір від 10 хв без сумнівних стрибків можна надіслати пропозицією заробітку в довідник робіт.

Технічно: (1) чистий модуль `desktop/src/jobtimer.cjs` — стан виміру й історія (як `sessionmoney.cjs`), тести `node --test`; (2) живлення з того самого `onMoney` «зору» (`vision.cjs`, баланс ~кожні 2 с), поріг стрибка — `money_rules.max_jump`; (3) нове вікно `timer.html` за зразком окремого вікна правил (specs/084: поверх гри, рухається лише з відкритою Alt+Q, кліки крізь нього в гру); (4) гаряча клавіша `timerKey` (типово Alt+T) — як `mapKey`; (5) пропозиція — **без нової міграції**: наявна `wiki_proposals` (section `job`, kind `edit`, `data: { pay }`, `source: 'game'`, дані виміру в `source_note`), тригер `wiki_proposal_new` сам ставить версію, ліміт і бан, RLS «add own» — лише від свого імені.

## Technical Context

**Language/Version**: Node (Electron main, CommonJS `.cjs`); TypeScript 5 + React 18 — вікно таймера

**Primary Dependencies**: Electron (`BrowserWindow`, `globalShortcut`, IPC), `@supabase/supabase-js` (уже в програмі), Vite (нова точка входу `timer.html`)

**Storage**: стан поточного виміру — `settings.jobTimer` (як `settings.sessionMoney`, переживає перезапуск); історія — `jobtimer.json` у теці програми (як `history.json`), до 200 вимірів; у базу — лише надіслана пропозиція (`public.wiki_proposals`)

**Testing**: `node --test` — `desktop/src/jobtimer.test.cjs` (логіка виміру, пауза, стрибки, історія, текст пропозиції); `vitest` — частина вікна, якщо є чиста логіка показу

**Target Platform**: Electron-програма Q-Hub (Windows) поверх GTA V (RAGE MP)

**Project Type**: desktop-app (головний процес + вікно React)

**Performance Goals**: цифри оновлюються ≤ 5 с після появи балансу (FR-008) — «зір» дає баланс ~кожні 2 с; вікно перемальовує секунди раз на 1 с без звернень до диска

**Constraints**: вікно не забирає фокус і мишу, коли Alt+Q закрита; без нового зчитування екрана; стан пишеться на диск лише при зміні стану (старт/пауза/стоп) і не частіше разу на 30 с під час відліку; режим стрімера — без ніку

**Scale/Scope**: 1 нове вікно, 1 чистий модуль, ~6 IPC-каналів, рядок у Налаштуваннях і «Гарячих клавішах», кнопка в плашці; без змін бази

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Вплив | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише читає баланс з екрана тим самим «зором»; у гру нічого не вводить | ✅ |
| II. Права — у базі, ролі фіксовані | Пропозиція — наявна таблиця й RLS «add own» (author = auth.uid(), лише pending); публікують лише admin/moderator через `wiki_decide`. Нових політик немає | ✅ |
| III. Знімки екрана приватні | Знімків не робить і не надсилає; у пропозиції лише цифри | ✅ |
| IV. Власні й перевірені дані | Вимір — дані гравця, у довідник лише через модерацію; сумнівні й короткі виміри не надсилаються | ✅ |
| V. Програма лише додає | Історія — локально; у базу лише пропозиція з явної дії гравця; облік угод не повертається, цифри сеансу не змінюються | ✅ |
| VI. Тести | Логіка виміру — `node --test`. Правила доступу не змінюються → нового SQL-тесту не потрібно (наявні тести 0057 покривають «add own» і заборону чужого автора) | ✅ |
| Процес | Тексти українською; запис у `pending`-пак журналу | ✅ |

Порушень немає. Повторна перевірка після Phase 1 — без змін.

## Project Structure

### Documentation (this feature)

```text
specs/086-job-earnings-timer/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── timer-ipc.md        # канали головний процес ↔ вікно таймера ↔ плашка (підпис: робота + рівень / власний)
│   └── wage-proposal.md    # рядок wiki_proposals, який надсилає програма
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
desktop/src/
├── jobtimer.cjs            # НОВИЙ: стан виміру, $/год, підпис (робота + рівень / власний), історія з групами, mergePay, текст пропозиції
├── jobtimer.test.cjs       # НОВИЙ: node --test
├── timerwin.cjs            # НОВИЙ (за потреби): місце вікна, межі екрана — як rulewin.cjs
├── main.cjs                # вікно таймера, timerKey, onMoney → таймер, IPC, надсилання пропозиції
└── preload.cjs             # API вікна таймера (qhub.timer*)

timer.html                  # НОВА точка входу Vite
src/desktop/
├── timerMain.tsx           # НОВИЙ: монтування вікна
├── Timer.tsx               # НОВИЙ: відлік / підсумок / історія / «Запропонувати в довідник»
├── Bar.tsx                 # кнопка «Таймер заробітку» в панелі значків
├── Settings.tsx            # рядок гарячої клавіші таймера
└── bar.css                 # стилі вікна таймера
src/lib/hotkeys.ts          # Alt+T у списку «У грі»
vite.app.config.ts          # input: timer
src/data/changelog.json     # рядок у pending-пак
```

**Structure Decision**: як окреме вікно правил (specs/084): чиста логіка в `.cjs` з тестами, головний процес тримає стан, вікно лише малює й шле команди.

## Complexity Tracking

Порушень конституції немає — розділ порожній.
