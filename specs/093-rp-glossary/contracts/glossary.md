# Контракт: глосарій

## RPC бази (`security definer`, `set search_path = ''`, перевірка `public.is_wiki_mod()` → `42501`)

| Функція | Вхід | Вихід | Помилки |
|---|---|---|---|
| `glossary_save(p_id uuid, p_term text, p_aliases text[], p_full_name text, p_description text, p_related text[])` | `p_id = null` — новий | `uuid` | `22023` поле поза межами (текст: що саме); `23505` назва вже є в «<інший термін>» |
| `glossary_hide(p_id uuid)` | | `void` | `P0002` |
| `glossary_unhide(p_id uuid)` | | `void` | `P0002`; `23505`, якщо назва вже зайнята іншим |
| `glossary_revert(p_id uuid, p_version int)` | | `void` (нова версія з дією `revert`) | `P0002` |

Кожна функція пише рядок `glossary_versions`. anon і `user`/`editor` — `42501`.

Читання: `glossary_terms` (`select term,aliases,full_name,description,related_rules` — усі; `+ id, hidden, version, updated_at` — команда); `glossary_versions` — лише команда.

## Чисті функції (`src/desktop/rulesSearch.ts`)

| Функція | Сигнатура | Поведінка |
|---|---|---|
| `searchRules` | `(topics, query, limit = 8, glossary: GlossaryTerm[] = [])` | після `normalizeQuery` — розширення словами терміну (research R3); пункти з `related_rules` — першими |
| `glossaryMatches` | `(glossary, query) => GlossaryTerm[]` | терміни в порядку слів запиту, без дублів; число — ніколи не термін |
| `relatedHits` | `(topics, term: GlossaryTerm) => RuleHit[]` | пункти за `related_rules` (`abbrsOf` + номер); не знайдене — пропускається |
| `knownRuleWord` | `(topics, w, glossary = [])` | + будь-яка назва терміну — відоме слово (для `fixedSearch`) |

Функція помічника викликає `searchRules` без глосарію (працює наявний `ALIAS`).

## `src/lib/glossary.ts`

- `loadGlossary(): Promise<GlossaryTerm[]>` — база → кеш `localStorage` (`qhub.glossary`, TTL 10 хв) → `src/data/glossary.json`.
- Команда: `loadGlossaryAdmin()`, `saveTerm()`, `hideTerm()`, `unhideTerm()`, `revertTerm()`, `termHistory(id)`.

## Інтерфейс

- **Плашка (`Bar.tsx`) і демо (`BarDemo.tsx`)**: над результатами — картки `GlossaryCard` (скорочення, `aliases` через кому, пояснення); без пунктів — «Окремого пункту в правилах немає».
- **Сайт `/wiki/glosariy`**: вкладка WIKI «Глосарій»; фільтр; список за абеткою `term`; клік розгортає: картка + до 8 пунктів правил.
- **Робоче місце команди** (`/admin?tab=glossary`, `/panel?tab=glossary` для модератора): список з «прибраними», форма терміну (поля з межами з data-model, помилки біля полів), «Історія» з версіями й «Відкотити до цієї», «Прибрати» / «Повернути».
