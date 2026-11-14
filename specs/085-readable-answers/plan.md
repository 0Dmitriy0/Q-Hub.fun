# Implementation Plan: Гарний і читабельний текст відповідей

**Branch**: `091-ai-better` (спека — `085-readable-answers`) | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/085-readable-answers/spec.md`

## Summary

Відповідь ШІ зараз — суцільний блок: `.bans` (`src/desktop/bar.css:107`) не зберігає переносів рядків, а промпт (`supabase/functions/assistant/plan.ts:11`) вимагає «звичайним текстом, одне-два речення». План: (1) чистий розбирач легкої розмітки `richText.ts` (абзаци, списки `-`/`•`/`1.`, `**жирне**`, позначки пунктів) з модульними тестами; (2) компонент `<Rich>` у `barParts.tsx`, що показує розібране й уже вміє `cites`; (3) застосувати його у відповіді ШІ (плашка, окреме вікно, «Історія») і в тексті пунктів правил; (4) типографіка й ієрархія в `bar.css`; (5) промпт ШІ: головна думка першим реченням, далі список, жирне — для сум і строків; (6) копіювання — чистий текст без розмітки.

## Technical Context

**Language/Version**: TypeScript 5 (React 18) — інтерфейс плашки й сайту; Deno (Supabase Edge Function) — асистент

**Primary Dependencies**: React; нових бібліотек немає (розбирач — власний, ~60 рядків; markdown-бібліотеки відкинуто — див. research.md R1)

**Storage**: N/A (історія відповідей — як є, сирий текст; новий вигляд будується при показі)

**Testing**: `vitest` — `src/desktop/richText.test.ts`, оновлені `barParts.test.ts`; `supabase/functions/assistant/plan.test.ts` — нові вимоги до промпту

**Target Platform**: Electron-програма Q-Hub (Windows) поверх GTA V; демо плашки на сайті

**Project Type**: desktop-app + web (спільні компоненти `src/desktop/`)

**Performance Goals**: розбір відповіді ≤ 2000 знаків — миттєво (< 1 мс), без помітної затримки показу

**Constraints**: без `dangerouslySetInnerHTML` (лише React-вузли — текст ШІ не може вставити HTML); текст лишається виділюваним; контраст ≥ 4,5 : 1 / 3 : 1; без горизонтальної прокрутки

**Scale/Scope**: 3 місця показу (Bar, RuleWin, BarDemo через RuleCard), 1 CSS-файл, 1 промпт

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Вплив | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише показ тексту у вікнах Q-Hub, гру не чіпає | ✅ |
| II. Права — у базі | Прав і ролей не стосується | ✅ |
| III. Знімки екрана приватні | Не стосується | ✅ |
| IV. Власні й перевірені дані | Промпт і далі забороняє вигадувати номери пунктів; `checkRefs` лишається | ✅ |
| V. Програма лише додає | Нічого не пише в базу | ✅ |
| VI. Тести на логіку | Розбирач розмітки й текст для копіювання — модульні тести `vitest`; промпт — `plan.test.ts` | ✅ |
| Процес розробки | Українські тексти; запис у `pending`-пак журналу (0.9.0) | ✅ |

Порушень немає. Повторна перевірка після Phase 1 — без змін.

## Project Structure

### Documentation (this feature)

```text
specs/085-readable-answers/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rich-text.md     # граматика легкої розмітки + контракт <Rich> і plainText
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/desktop/
├── richText.ts          # НОВИЙ: parseRich(text) → блоки; plainText(text) → чистий текст для буфера
├── richText.test.ts     # НОВИЙ: абзаци, списки, жирне, зламана розмітка, порожні рядки, позначки пунктів
├── barParts.tsx         # <Rich text cite?>; RuleCard: тіло пункту через <Rich>, згортання — по висоті
├── Bar.tsx              # .bans → <Rich>; CopyBtn text={plainText(a.reply)}
├── RuleWin.tsx          # тіло правила / відповіді ШІ → <Rich>
└── bar.css              # .rich: абзаци, списки, маркери, жирне, ширина рядка; ієрархія .brule, .bpen

supabase/functions/assistant/
├── plan.ts              # SYSTEM: формат відповіді (головна думка → список, **жирне**)
└── plan.test.ts         # перевірка нових вимог формату

src/data/changelog.json  # рядок у верхній pending-пак
```

**Structure Decision**: усе в наявних модулях плашки; один новий чистий модуль `richText.ts`, щоб логіку розбору тестувати без React.

## Complexity Tracking

Порушень конституції немає — розділ порожній.
