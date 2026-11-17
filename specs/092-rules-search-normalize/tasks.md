---

description: "Task list: Пошук по правилах розуміє не ту розкладку й інший роздільник"
---

# Tasks: Пошук по правилах розуміє не ту розкладку й інший роздільник

**Input**: `specs/092-rules-search-normalize/` — plan.md, spec.md, research.md, data-model.md, contracts/search-functions.md, quickstart.md

**Tests**: обов'язкові (вимога власника в `/speckit-plan` і конституція, принцип VI): vitest на кожен приклад специфікації + регресія наявних тестів пошуку.

**Organization**: US1 (роздільники) і US2 (розкладка) — обидві P1; US1 — MVP, бо не потребує словника й підказки. US3 (ШІ за виправленим запитом) — P3, спирається на US2.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Закомітити `specs/092-rules-search-normalize/` у гілку `092-rules-search-normalize` (уже створена від `main`)

---

## Phase 2: Foundational

Немає: обидві P1-історії стартують з `src/desktop/rulesSearch.ts` незалежно; спільних передумов немає.

---

## Phase 3: User Story 1 — Номер пункту з будь-яким роздільником (P1) 🎯 MVP

**Goal**: «3/3», «3,3», «3ю3», «3б3», «3 3», «3-3» → ті самі результати, що «3.3»; «3/3/1» → «3.3.1»; без підказки.

**Independent Test**: `npx.cmd vitest run src/desktop/rulesSearch.test.ts` — новий блок `normalizeQuery` і `searchRules` з роздільниками зелені, наявні тести без змін.

- [X] T002 [US1] Тести спершу в `src/desktop/rulesSearch.test.ts`, новий `describe('normalizeQuery (specs/092)')`:
  - «3/3», «3,3», «3ю3», «3б3», «3 3», «3-3», «3_3», «3\\3», «3 / 3», «3  -  3» → «3.3»;
  - «3/3/1», «3-3/1», «3ю3ю1», «3.3.1» → «3.3.1»;
  - «КК 6/7» → «кк 6.7»;
  - без змін, лише нижній регістр: «кк/пдр», «3/», «/3», «зелена-зона», «бізнес-вар», «ЗЕЛЕНА ЗОНА» → «зелена зона»;
  - ідемпотентність: `normalizeQuery(normalizeQuery(q)) === normalizeQuery(q)` для всіх прикладів;
  - на вбудованій копії правил (`RULES.topics`): `searchRules(t, x).map(h => h.n + h.topic)` для кожного з «3/3 дк», «3,3 дк», «3ю3 дк», «3б3 дк», «3 3 дк», «3-3 дк» дорівнює результату «3.3 дк», і він не порожній (у Дорожньому кодексі є пункти 3.3); «КК 6/7» = «КК 6.7»; наявний тест «10,10» лишається зеленим
- [X] T003 [US1] `src/desktop/rulesSearch.ts`: експорт `QUERY_SEP` і `normalizeQuery(query: string): string` за research R2 / data-model:
  - `toLowerCase()`, `trim()`, кілька пробілів → один;
  - між двома цифрами `\s*[\/\\,\-_юб.]\s*` або `\s+` → «.»; повторювати заміну, поки рядок змінюється (щоб «3/3/1» дав «3.3.1»);
  - нічого іншого не змінювати (роздільник не між цифрами лишається, FR-002)
- [X] T004 [US1] `src/desktop/rulesSearch.ts` `searchRules`: перший рядок `const q = query.replace(/(\d),(\d)/g, '$1.$2')` замінити на `const q = normalizeQuery(query)`; оновити коментар («10,10», «3/3», «3 3» — те саме, що «10.10», «3.3»). Перевірити, що `onlyNums` і `NUM` працюють з нормалізованим рядком (запит «3 3» тепер «3.3», а не два числа)

**Checkpoint**: роздільники працюють у плашці й демо без змін інтерфейсу.

---

## Phase 4: User Story 2 — Слова в не тій розкладці (P1)

**Goal**: «ghfdbkf» → «правила», «3/3 lr» → «3.3 дк», «ufhf;» → гаражі на мапі, «вь» → «dm», «'ktrnhjyysq» → «електронний»; лише коли набраний запит нічого не знайшов; підказка «Показано результати для: …».

**Independent Test**: vitest — `toLayout`, `layoutVariants`, `fixedSearch`, `knownPlaceWord` зелені; у плашці «3/3 lr» показує підказку «3.3 дк».

- [X] T005 [P] [US2] Тести спершу в `src/desktop/rulesSearch.test.ts`, `describe('розкладка (specs/092)')`:
  - `toLayout`: «lr» → ua «дк»; «ghfdbkf» → «правила»; «GHFDBKF» і «GhFdBkF» → «правила»; «ufhf;» → «гараж»; «ptktyj]» → «зеленої»; «вь» → en «dm»; «'ktrnhjyysq» → ru «електронний» (з приведенням ы→и, э→е); «'ktrnhjyysq» → ua — не «електронний» (є→є лишається);
  - `layoutVariants('dm pfkty', w => w === 'dm')` → перший варіант починається з «dm зелен»; `layoutVariants('3/3 lr', () => false)` → «3.3 дк» першим; варіантів ≤ 2, без дублів, без збігу з набраним; кириличне «вь» → «dm»;
  - `fixedSearch` з фейковим `run`: набраний знайшов → `shown: null`, `run` викликано один раз; набраний порожній, український варіант знайшов → `shown` = він; лише російський знайшов → `shown` = російський; нічого → `shown: null`, результат за набраним
- [X] T006 [P] [US2] Тест у `src/desktop/barSearch.test.ts`: `knownPlaceWord(marks, cats, 'гараж')` → true для мітки «Гараж №2» / категорії «Гаражі»; «pfkty» → false
- [X] T007 [US2] `src/desktop/rulesSearch.ts`: константи за data-model:
  - `LAYOUT_UA` — `q й w ц e у r к t е y н u г i ш o щ p з [ х ] ї a ф s і d в f а g п h р j о k л l д ; ж ' є z я x ч c с v м b и n т m ь , б . ю`, `` ` `` → `'`;
  - `LAYOUT_RU` — як `LAYOUT_UA`, але `s→ы`, `]→ъ`, `'→э`, `` ` ``→`ё`;
  - `RU_TO_UA` — `ы→и`, `э→е`, `ё→е`, `ъ→''`;
  - обернені (кирилиця → латиниця) — одним проходом при завантаженні модуля;
  - `toLayout(word, to: 'ua' | 'ru' | 'en')`: посимвольно, нижній регістр; для `'ru'` — після переведення `RU_TO_UA`; символ без пари лишається
- [X] T008 [US2] `src/desktop/rulesSearch.ts`: `layoutVariants(query, known)` за research R4–R5:
  - спершу `normalizeQuery(query)`;
  - латинське слово — `[a-z;'\[\],.\`]+` з хоча б однією латинською літерою, `,`/`.` на краях — відкидаються; кириличне — `[\p{Script=Cyrillic}']+`;
  - `known(word)` → слово лишається; інакше латинське → `toLayout(w,'ua')` / `toLayout(w,'ru')`, кириличне → `toLayout(w,'en')`; цифри й номери — без змін;
  - результат — `[ua, ru]` без дублів і без варіанта, що дорівнює нормалізованому набраному
- [X] T009 [US2] `src/desktop/rulesSearch.ts`: `knownRuleWord(topics, w)` — true, якщо `w` у `STOP`, `ALIAS`, починається з префікса `SLANG`, є скороченням документа (`index(topics).abbr`) або є слово словника (`index(topics).vocab`), що починається з `stem(w)`; `fixedSearch<T>(query, run, isEmpty, known)` за research R6 (повертає `{ result, shown }`, `shown` — нормалізований варіант)
- [X] T010 [US2] `src/desktop/barSearch.ts`: `knownPlaceWord(marks, cats, w)` — `stem(norm(w))` міститься в `norm` назви хоч однієї мітки чи категорії
- [X] T011 [US2] `src/desktop/Bar.tsx`:
  - `interface Ask` + `fixed?: string`;
  - `rulesAsk`/`askRules`: `fixedSearch(text, q => ({ hits: searchRules(TOPICS, q), places: places(q, marks, cats) }), r => !r.hits.length && !r.places.length, w => knownRuleWord(TOPICS, w) || knownPlaceWord(marks, cats, w))` → `Ask { q: text, hits, places, fixed: shown ?? undefined, reply: … }`;
  - над результатами відповіді (поруч з рядком 325, перед `brules`): якщо `a.fixed` — `<p className="bfix" role="status">Показано результати для: <b>{a.fixed}</b></p>`
- [X] T012 [P] [US2] `src/desktop/bar.css`: `.bfix` — дрібний приглушений рядок (`font-size: 12.5px; color: var(--muted)`; `b` — звичайний колір), відступ як у сусідніх блоків відповіді
- [X] T013 [P] [US2] `src/components/BarDemo.tsx`: те саме, що T011 (`Ask.fixed`, `fixedSearch` у `rulesAsk`, рядок підказки над `brules`); стиль `.bfix` — у стилях сайту для демо плашки (там, де стилі `.brules` демо)

**Checkpoint**: обидві P1-історії готові.

---

## Phase 5: User Story 3 — Помічник отримує виправлений запит (P3)

**Goal**: Shift+Enter передає ШІ пункти за тим запитом, за яким їх показано.

**Independent Test**: у плашці Shift+Enter з «ghfdbkf ptktyj] pjy» — у запиті до ШІ уривок з пунктами про зелені зони.

- [X] T014 [US3] `src/desktop/Bar.tsx` (рядок ~187, `api.quickAsk`): `const f = fixedSearch(text, q => searchRules(TOPICS, q, 40), h => !h.length, w => knownRuleWord(TOPICS, w));` → `rulesExcerpt(f.result, 24000)`

---

## Phase 6: Polish & Cross-Cutting

- [X] T015 `src/data/changelog.json`: у верхній запис з `"pending": true` (не створювати новий, якщо він є) у `changed` — «Пошук правил у плашці розуміє номер пункту через /, -, пробіл чи «ю» і запит, набраний не в тій розкладці (англійська, українська, російська) — показує, що саме знайшов»
- [X] T016 `npm.cmd test` і `npm.cmd run typecheck` — зелені; наявні тести `rulesSearch.test.ts` без змін (SC-003)
- [ ] T017 Ручна перевірка за `specs/092-rules-search-normalize/quickstart.md` (розділ «Вручну»): закрити запущену Q-Hub власника, `cd desktop && npm.cmd start`, Alt+Q — «3/3 lr», «3.3 дк», «ufhf;», Shift+Enter; демо на сайті — «ghfdbkf»

---

## Dependencies & Execution Order

- T001 → US1 (T002 → T003 → T004).
- US2: T005, T006 (тести) — паралельно; T007 → T008 → T009 (той самий файл, послідовно); T010 після T006; T011 після T009–T010; T012, T013 — паралельно з T011.
- US3 (T014) — після T009.
- T003 потрібен для T008 (`layoutVariants` викликає `normalizeQuery`), тож US2 стартує після US1.

## Parallel Example

```text
US2: T005 (тести rulesSearch) ‖ T006 (тест barSearch)
US2: T012 (bar.css) ‖ T013 (BarDemo.tsx) — після T009–T010
```

## Implementation Strategy

1. **MVP = US1** (T001–T004): роздільники в номерах; жодних змін інтерфейсу — найменший ризик.
2. **US2** (T005–T013): розкладка з підказкою в програмі й демо.
3. **US3** (T014) і Polish (T015–T017).

Усе — один PR; програма виходить паком (запис у `pending`), реліз — лише коли власник скаже «випускай».
