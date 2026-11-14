# Implementation Plan: Окреме вікно з правилом поверх гри

**Branch**: `089-rule-sticky` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/084-rule-sticky/spec.md`

## Summary

Біля кожного пункту правил і законів у відповіді Alt+Q (`RuleCard`, `src/desktop/barParts.tsx`) з'являється кнопка «Відкрити окремо». Вона передає пункт у головний процес, і там відкривається одне окреме вікно Electron `rule.html` з вкладками (до 5). Поки плашка Alt+Q видна, вікно **розблоковане**: рухається за заголовок, міняє розмір за краї, вкладки перемикаються й закриваються. Плашку сховано — **зафіксоване**: `setIgnoreMouseEvents(true)` + `setFocusable(false)` + `setResizable/Movable(false)`, кліки йдуть у гру. Стан вкладок і розрахунок місця — чистий модуль `desktop/src/rulewin.cjs` з `node --test`. Місце й розмір пишуться в `settings.ruleWin`, вкладки — лише в пам'яті (зникають після перезапуску, Clarifications 2026-11-14).

## Technical Context

**Language/Version**: JavaScript CommonJS (головний процес `desktop/src/main.cjs`, Electron 37.10.3); TypeScript + React 19 (сторінки програми, `vite.app.config.ts`)
**Primary Dependencies**: наявні: Electron `BrowserWindow`/`screen`, `preload.cjs` (міст `window.qhub`), `splitPenalty`/`ruleText`/`KIND`/`numLabel` з `barParts.tsx` і `rulesSearch.ts`, стилі `src/desktop/bar.css`. Нових пакетів немає
**Storage**: `settings.json` у теці програми — нове поле `ruleWin: { x, y, width, height }` (запис цілим файлом, `store.cjs`)
**Testing**: `node --test` — `desktop/src/rulewin.test.cjs` (вкладки, місце, межі екрана); `vitest` — кнопка не з'являється у відповіді ШІ (наявні тести `barParts.test.ts`); ручна перевірка в грі — `quickstart.md`
**Target Platform**: Windows 10/11, гра в режимі «вікно без рамки» (як основна плашка)
**Project Type**: desktop-app (Electron) + спільний з сайтом React-код
**Performance Goals**: вікно з'являється ≤ 300 мс після натискання (створюється раз, далі лише ховається, як мапа)
**Constraints**: зафіксоване вікно не бере фокус і мишу гри (FR-005, FR-009); вікно не прозоре — frameless-вікно з `transparent: true` на Windows не міняє розмір (research R1)
**Scale/Scope**: ~70 рядків у `main.cjs`, ~80 — `rulewin.cjs` + тести, ~120 — `RuleWin.tsx`/`ruleMain.tsx`, 5 викликів у `preload.cjs`, 1 кнопка в `RuleCard`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Вікно лише показує текст; у грі нічого не натискає. Кліки «проходять» завдяки `setIgnoreMouseEvents` — це вікно ОС, не втручання в процес гри | ✅ |
| II. Права | База не змінюється | ✅ (N/A) |
| III. Знімки приватні | Знімків немає | ✅ (N/A) |
| IV. Перевірені дані | Показується той самий текст пункту, що й у відповіді; сам не оновлюється (Edge Cases) | ✅ |
| V. Програма лише додає | Нічого не надсилає; вкладки — у пам'яті, місце — локально | ✅ |
| VI. Тести | Чиста логіка (вкладки, місце, межі) — `rulewin.test.cjs` | ✅ |

Порушень немає. **Після Phase 1** — без змін, ✅.

## Project Structure

### Documentation (this feature)

```text
specs/084-rule-sticky/
├── plan.md              # цей файл
├── research.md          # Phase 0: рішення R1–R7
├── data-model.md        # Phase 1: вкладка, стан вікна, збережене місце
├── quickstart.md        # Phase 1: перевірка в грі
├── contracts/
│   └── rule-window.md   # IPC плашка ↔ головний процес ↔ вікно правила
└── tasks.md             # /speckit-tasks (ще немає)
```

### Source Code (repository root)

```text
rule.html                         # нова сторінка (вхід Vite), як bar.html / map.html
vite.app.config.ts                # + input rule: 'rule.html'
src/desktop/
├── ruleMain.tsx                  # нове: монтування сторінки
├── RuleWin.tsx                   # нове: заголовок «Правило», вкладки, пункт, режим «зафіксовано»
├── barParts.tsx                  # RuleCard: + кнопка «Відкрити окремо» (лише якщо є api.ruleOpen)
├── Bar.tsx                       # прокидує ruleOpen у RuleCard
└── bar.css                       # + стилі .rwin-* (ті самі токени теми)
desktop/src/
├── rulewin.cjs                   # нове: чисті функції — tabs (add/activate/close), place, fit
├── rulewin.test.cjs              # нове
├── main.cjs                      # createRuleWin/openRule/lock/unlock, збереження місця, IPC
└── preload.cjs                   # ruleOpen, ruleState, onRuleState, ruleTab, ruleCloseTab, ruleClose
src/data/changelog.json           # рядок у верхній запис пака з "pending": true
```

**Structure Decision**: як вікно мапи (specs/014): окрема сторінка Vite + вікно, що створюється при першому відкритті й далі лише ховається; розрахунок місця — чистий модуль поруч (`mapwin.cjs` → `rulewin.cjs`). Стан вкладок тримає головний процес (одне джерело правди, переживає перезавантаження сторінки), сторінка лише малює те, що отримала.

## Complexity Tracking

Порушень конституції немає — розділ не потрібен.
