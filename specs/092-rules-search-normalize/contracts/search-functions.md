# Контракт: функції модуля пошуку

Усі функції чисті (без мережі, DOM, глобального стану, крім наявного кешу словника `index()`).

## `src/desktop/rulesSearch.ts`

| Функція | Сигнатура | Поведінка |
|---|---|---|
| `normalizeQuery` | `(query: string) => string` | нижній регістр, `trim`; роздільник між цифрами → «.» (research R2). «3/3» → «3.3», «3ю3» → «3.3», «3 / 3» → «3.3», «3/3/1» → «3.3.1», «кк/пдр» → «кк/пдр», «ЗЕЛЕНА-ЗОНА» → «зелена-зона» |
| `toLayout` | `(word: string, to: 'ua' \| 'ru' \| 'en') => string` | переведення за клавішами; для `'ru'` — разом з приведенням `RU_TO_UA`; символи без пари лишаються |
| `layoutVariants` | `(query: string, known: (w: string) => boolean) => string[]` | до 2 виправлених запитів (уже нормалізованих); відомі слова й цифри — без змін (research R4, R5) |
| `knownRuleWord` | `(topics: RuleTopic[], w: string) => boolean` | службове, ALIAS, сленг, скорочення документа, або основа є в словнику пунктів |
| `fixedSearch` | `<T>(query: string, run: (q: string) => T, isEmpty: (r: T) => boolean, known: (w: string) => boolean) => FixedSearch<T>` | research R6 |
| `searchRules` | без змін сигнатури | перший рядок — `normalizeQuery` замість заміни лише коми |

## `src/desktop/barSearch.ts`

| Функція | Сигнатура | Поведінка |
|---|---|---|
| `knownPlaceWord` | `(marks: PlaceMark[], cats: PlaceCat[], w: string) => boolean` | основа слова є в назві мітки чи категорії |

## Інтерфейс (`Bar.tsx`, `BarDemo.tsx`)

- `rulesAsk` / `askRules`: `fixedSearch(text, q => ({ hits: searchRules(TOPICS, q), places: places(q, …) }), r => !r.hits.length && !r.places.length, known)` → `Ask { …, fixed: shown ?? undefined }`.
- Над результатами, якщо `fixed`: `<p className="bfix" role="status">Показано результати для: <b>{fixed}</b></p>`.
- Shift+Enter: `rulesExcerpt(searchRules(TOPICS, shown ?? text, 40))`.
