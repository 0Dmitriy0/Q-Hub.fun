# Implementation Plan: Пошук по правилах розуміє не ту розкладку й інший роздільник

**Branch**: `092-rules-search-normalize` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/092-rules-search-normalize/spec.md`

## Summary

Плашка Alt+Q (і її демо на сайті) розуміє номер пункту з будь-яким роздільником між цифрами («3/3», «3ю3», «3 3» → «3.3») і запит, набраний не в тій розкладці («lr» → «дк», «ghfdbkf» → «правила»). Технічно (вимога власника): окрема чиста `normalizeQuery(query)` у модулі пошуку `src/desktop/rulesSearch.ts`, таблиці розкладок — константи, без нових залежностей, обов'язкові vitest-тести на всі приклади. Переведення розкладки — другим пошуком лише коли набраний запит нічого не знайшов (правила й місця на мапі разом), з підказкою «Показано результати для: …».

## Technical Context

**Language/Version**: TypeScript 7 (React 19) — спільний код сайту й програми (`src/desktop/`)

**Primary Dependencies**: немає нових

**Storage**: N/A

**Testing**: vitest (`src/desktop/rulesSearch.test.ts`, `src/desktop/barSearch.test.ts`)

**Target Platform**: програма Q-Hub (Electron, плашка Alt+Q) і демо плашки на сайті

**Project Type**: desktop-app + вебсайт зі спільними модулями

**Performance Goals**: без помітної затримки (SC-005); другий пошук лише при порожньому першому

**Constraints**: коректні запити — ті самі результати, без підказки (SC-003, SC-004); роздільник замінюється лише між цифрами

**Scale/Scope**: 1 модуль логіки + 1 перевірка в пошуку місць + 2 точки показу (програма, демо) + тести + запис журналу

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише обробка тексту, який гравець набрав у плашці; гри не торкається | ✅ |
| II. Права — у базі | Даних і прав не змінюється | ✅ |
| III. Знімки приватні | Знімків не торкається | ✅ |
| IV. Власні дані | Джерело — ті самі правила (rules-sync / вбудована копія) | ✅ |
| V. Програма лише додає | Записів у базу немає | ✅ |
| VI. Тести на логіку | Чиста логіка — vitest на кожен приклад специфікації + регресія наявних тестів пошуку | ✅ |

**Post-design re-check**: ✅ без змін.

## Project Structure

### Documentation (this feature)

```text
specs/092-rules-search-normalize/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/search-functions.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/desktop/
├── rulesSearch.ts        # normalizeQuery, LAYOUT_UA/LAYOUT_RU, toLayout, layoutVariants, knownRuleWord, fixedSearch; searchRules → normalizeQuery
├── rulesSearch.test.ts   # тести на всі приклади специфікації
├── barSearch.ts          # knownPlaceWord
├── barSearch.test.ts     # knownPlaceWord, «ufhf;» → гараж
├── Bar.tsx               # Ask.fixed, підказка, Shift+Enter за виправленим запитом
└── bar.css               # .bfix
src/components/BarDemo.tsx  # те саме в демо на сайті
src/data/changelog.json     # запис у верхній pending пак
```

**Structure Decision**: наявні файли; нових модулів немає (вимога «у модулі пошуку»).

## Порядок

1. `normalizeQuery` + тести роздільників → `searchRules` на неї (кома — як і раніше).
2. Таблиці розкладок, `toLayout`, `layoutVariants`, `knownRuleWord`, `knownPlaceWord` + тести.
3. `fixedSearch` + підказка в `Bar.tsx` і `BarDemo.tsx`; Shift+Enter.
4. Журнал оновлень, ручна перевірка в програмі (перезапуск з коду).

## Complexity Tracking

Порушень конституції немає.

| Відхилення від вимоги | Навіщо | Чому не простіше |
|---|---|---|
| Таблиця розкладки EN↔UA **і EN↔RU** (а не лише EN↔UA) | Рішення власника в `/speckit-clarify` (варіант B) | Лише EN↔UA суперечить уточненню; RU додано другою константою з приведенням літер до української, інакше вона нічого не знаходить |
| Крім `normalizeQuery(query)` — ще чисті `layoutVariants(query, known)` і `fixedSearch(...)` | Розкладку не можна виправити одним аргументом: «dm» треба лишити, «pfkty» — перевести; це знає лише словник правил і міток | `normalizeQuery` лишається чистою з одним аргументом і робить те, що можна без словника (регістр, роздільники); словник передається предикатом, тож усе лишається чистим і тестованим |
