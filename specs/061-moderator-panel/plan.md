# Implementation Plan: Зрозуміла панель для модераторів

**Branch**: `061-moderator-panel` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/061-moderator-panel/spec.md`

## Summary

Нова сторінка сайту `/panel` для редакторів, модераторів і адміна. Модератор бачить «Чекає на тебе» з лічильниками, розбирає пропозиції довідника на одному екрані з переходом до наступної, бачить свої рішення. Редактор бачить «Мої інструменти»: свої чернетки міток і переходи до меж цін та івентів. Розбір виноситься з `AdminWiki.tsx` у спільні компоненти, тож вкладка «Довідник» адміна отримує ту саму поведінку, а склад вкладок адміна не змінюється. База, права й міграції — без змін; уся нова логіка — чисті функції з тестами `vitest`.

## Technical Context

**Language/Version**: TypeScript 5, React 18 (сайт, Vite)
**Primary Dependencies**: react-router-dom, @supabase/supabase-js — наявні, нових немає
**Storage**: Supabase Postgres — лише читання наявних таблиць (data-model.md); нових таблиць і міграцій немає
**Testing**: `vitest` (чисті функції + тест текстів), `tsc --noEmit`; SQL-тести наявні (`wiki_test.sql`, `map_drafts_test.sql`) — нових не треба, права не змінюються (research R11)
**Target Platform**: сайт у браузері, ПК і телефон від 360 px, світла й темна тема
**Project Type**: web (лише фронтенд сайту; програма `desktop/` не зачіпається → без запису в `changelog.json`)
**Performance Goals**: «Чекає на тебе» — один легкий запит (без `data`); черга до 50 рядків на екрані
**Constraints**: FR-006 (без технічних слів), FR-012 (360 px), FR-016 (права без змін), FR-017 (вкладки адміна без змін)
**Scale/Scope**: кілька модераторів і редакторів; черга — десятки пропозицій

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише сайт, програма не змінюється | ✅ |
| II. Права — у базі, ролі фіксовані | Нових ролей, політик і функцій немає; панель показує тільки те, що база віддає ролі; модератор публікує лише довідник, редактор лише подає чернетки — як було | ✅ |
| III. Знімки приватні | Скріни-докази — наявний приватний `wiki-proof` з підписаним посиланням, як в `AdminWiki`; навчальні знімки панель не показує | ✅ |
| IV. Власні й перевірені дані | Дані не змінюються, лише показ | ✅ |
| V. Програма лише додає, без інтернету | Не зачіпається | ✅ |
| VI. Тести | Зміни прав немає → SQL-тест не потрібен; чиста логіка (`summarize`, `nextProposal`, `mergeDecisions`, `draftCounts`, `panelError`) — `vitest`; тест заборонених слів | ✅ |
| Процес: тексти українською | Усі тексти панелі українською, без англійських назв ролей | ✅ |

**Повторна перевірка після Phase 1**: дизайн (data-model, contracts) не додав жодних записів у базу — ✅ без порушень. Complexity Tracking не потрібен.

## Project Structure

### Documentation (this feature)

```text
specs/061-moderator-panel/
├── spec.md
├── plan.md              # цей файл
├── research.md          # R1–R11
├── data-model.md        # джерела й клієнтські структури
├── quickstart.md        # 14 сценаріїв перевірки
├── contracts/
│   └── panel-ui.md      # адреси, ролі, тексти
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── App.tsx                         # + маршрути /panel, /panel/rozbir, /panel/rishennia, /panel/prybrani
├── components/
│   ├── Layout.tsx                  # кнопка «Панель» для editor/moderator з лічильником; admin — без змін
│   ├── admin/
│   │   └── AdminWiki.tsx           # розбір, «Прибрані», «Заборони» → спільні компоненти; лишається «Налаштування довідника»
│   └── panel/                      # нове
│       ├── PanelHome.tsx           # «Чекає на тебе» + «Мої інструменти»
│       ├── ReviewQueue.tsx         # список + відкрита пропозиція + рішення (спільний з вкладкою адміна)
│       ├── ProposalView.tsx        # одна пропозиція: зміни, автор, джерело, скрін, дії
│       ├── MyDecisions.tsx
│       └── HiddenAndBans.tsx       # перенесені «Прибрані сторінки» й «Заборони»
├── pages/
│   ├── Panel.tsx                   # доступ за роллю, переадресації, підсторінки
│   └── Admin.tsx                   # moderator → /panel (замість однієї вкладки); посилання «Панель модераторів»
├── lib/
│   ├── panel.ts                    # summarize, nextProposal, mergeDecisions, draftCounts, panelError, taskKind
│   ├── panel.test.ts
│   └── panelCopy.test.ts           # заборонені слова в текстах панелі (research R10)
└── styles (наявний файл стилів)    # розкладка розбору: дві колонки / на весь екран до 720 px, кнопки sticky
```

**Structure Decision**: лише фронтенд сайту в наявній структурі `src/`; нова тека `src/components/panel/` для екранів панелі, логіка — в `src/lib/panel.ts` поруч із `wiki.ts`.

## Порядок робіт (для /speckit-tasks)

1. `lib/panel.ts` + тести (без інтерфейсу — перевіряється окремо).
2. Спільні `ReviewQueue` / `ProposalView` з `AdminWiki` — вкладка адміна працює як раніше (US6).
3. `/panel` з «Чекає на тебе» і розбором (US1, US2) — MVP для модераторів.
4. «Мої інструменти» для редактора (US3), шапка й переадресації.
5. Тексти й тест заборонених слів (US4), «Мої рішення» (US5).
6. Ні `changelog.json` (програма не змінюється), ні `sitenews.json` (панель бачать лише помічники, не гравці) — модераторам власник скаже сам.

## Complexity Tracking

Порушень конституції немає.
