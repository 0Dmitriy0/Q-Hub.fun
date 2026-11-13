# Implementation Plan: Після «Надіслати мітку» — одразу назад у гру

**Branch**: `083-pin-send-refocus` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/078-pin-send-refocus/spec.md`

## Summary

Після будь-якої дії у формі мітки (надіслати / не надсилати, кнопкою, Enter чи Esc) форма закривається, і фокус повертається грі тим самим механізмом, що вже працює для плашки й мапи (`gameFocus` у `desktop/src/gamefocus.cjs`). Зараз ламається у двох місцях (research.md, R1–R2): клавіша мітки не запам'ятовує вікно гри, а обробник рішення форми ховає плашку без повернення фокусу. Виправлення — у головному процесі програми, без змін інтерфейсу форми й бази.

## Technical Context

**Language/Version**: JavaScript (CommonJS) у головному процесі Electron; інтерфейс плашки — React/TypeScript (не змінюється)
**Primary Dependencies**: Electron (`BrowserWindow`, `globalShortcut`, `ipcMain`), `koffi` → `user32.dll` (`GetForegroundWindow`, `SetForegroundWindow`, `IsWindow`) — уже використовується
**Storage**: N/A (черга чернеток `outbox` не змінюється)
**Testing**: `node --test` у `desktop/` (`gamefocus.test.cjs`, новий тест логіки закриття форми); димова перевірка `main.cjs` підробленим electron; перевірка власником у грі
**Target Platform**: Windows 10/11, гра RAGE MP у режимі «вікно без рамки»
**Project Type**: desktop-app (Electron), частина монорепо з сайтом
**Performance Goals**: керування в грі ≤ 0,5 с після натискання (SC-003), незалежно від мережі
**Constraints**: принцип I конституції — програма лише перемикає вікно ОС, нічого не натискає в грі; без інтернету — так само (принцип V)
**Scale/Scope**: 2 точки в `desktop/src/main.cjs` + мала чиста функція з тестом; ~20 рядків

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише `SetForegroundWindow` вікна гри — те саме, що вже робить Esc у плашці; жодних натискань, інʼєкцій, читання пам'яті | ✅ |
| II. Права в базі | База й права не змінюються | ✅ (N/A) |
| III. Знімки приватні | Шлях знімка/пропозиції не змінюється | ✅ (N/A) |
| IV. Перевірені дані | Не стосується | ✅ (N/A) |
| V. Лише додає, без інтернету | Повернення фокусу не чекає мережі; черга `outbox` без змін (SC-004) | ✅ |
| VI. Тести | Рішення «повертати фокус чи ні» винесено в чисту функцію з `node --test` | ✅ |

Порушень немає — Complexity Tracking не потрібен.

**Після Phase 1**: дизайн не додав нових залежностей, даних чи прав — перевірка та сама, ✅.

## Project Structure

### Documentation (this feature)

```text
specs/078-pin-send-refocus/
├── spec.md
├── plan.md              # цей файл
├── research.md          # R1–R4: причини й рішення
├── data-model.md        # стан «вікно гри» й форми мітки
├── quickstart.md        # перевірка в грі й тести
├── contracts/
│   └── pin-decide.md    # IPC «pin-decide» — що обіцяє головний процес
└── checklists/requirements.md
```

### Source Code (repository root)

```text
desktop/src/
├── main.cjs             # клавіша мітки → game.remember(); обробник pin-decide → повернути фокус
├── gamefocus.cjs        # без змін (або + маленька чиста функція рішення, див. research R3)
├── gamefocus.test.cjs   # + тести рішення «повертати фокус»
└── preload.cjs          # без змін (pinDecide уже є)
src/desktop/Bar.tsx      # без змін (форма вже шле pinDecide і перемикає вигляд на main)
src/data/changelog.json  # рядок у верхній запис пака (pending)
```

**Structure Decision**: зміна лише в головному процесі програми (`desktop/src/`); інтерфейс плашки й сайт не чіпаються.

## Complexity Tracking

Не потрібно — порушень конституції немає.
