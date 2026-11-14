# Research: Назви міток — галочка на категорію

## R1. Де зберігати

- **Decision**: колонка `public.map_categories.show_labels boolean not null default false` (міграція `0067_category_labels.sql`, `add column if not exists`). Наявні рядки отримують `false` — це й є рішення власника A (FR-005); нові — теж `false` (FR-004).
- **Rationale**: категорії вже в базі й читаються мапою (`select('*')` у `src/lib/mapMarks.ts`), тож нова колонка приходить без змін запиту. Політика `map_categories: admin write` (`0015_map.sql`, `for all using (is_admin())`) уже обмежує зміну адміном (принцип II).
- **Alternatives considered**: налаштування в коді чи `wiki_settings` — не редагується з адмінки по категорії.

## R2. Правило показу підпису

- **Decision**: `labelShown(mark, cat)` у `src/lib/mapData.ts`: `!!mark.name?.trim() && mark.label !== false && catLabels(cat)`, де `catLabels(cat)` = `cat.show_labels` якщо поле є (`boolean`), інакше `true` (база ще без міграції — поведінка як зараз, spec edge case). Невідома категорія (мітка без категорії в списку) — `true`, як зараз.
- **Rationale**: одне місце правила для сайту й програми; тест покриває всі гілки.

## R3. Вбудовані категорії (у коді)

- **Decision**: `BUILTIN` у `src/lib/mapMarks.ts` (`names`, `zones`, `jobs`, `buyers`) — `show_labels: false` для `jobs` і `buyers` (рішення A — «усім наявним ні»). `names` і `zones` — шари без підписів міток, поле не впливає.
- **Rationale**: вбудовані категорії не редагуються в адмінці (`own = cats.filter(c => !c.builtin)`), тож їхнє значення живе в коді. Увімкнути назви робіт/скупників — правка одного рядка в `BUILTIN` (записати в quickstart і звіті).
- **Alternatives considered**: дозволити редагувати вбудовані в адмінці — нові рядки в базі для вбудованих, ширша зміна; не в цій функції.

## R4. Адмінка

- **Decision**: у `CategoryEdit` (`MapAdmin.tsx`, форма «Змінити категорію») — поле `show_labels` у `form(c)` і в `update(v)`; чекбокс «Показувати назви міток на мапі» з підказкою «Під значками на наближеній мапі; назва однаково видна по кліку й у пошуку». У «Нова категорія» (`addCat`) — той самий чекбокс, за замовчуванням знятий, `show_labels` у `insert(row)`. Помилка «column show_labels» → підказка «запусти supabase/migrations/0067_category_labels.sql у Supabase → SQL Editor» (як для інших міграцій).
- **Rationale**: FR-002; наявний шаблон підказок про незастосовані міграції.

## R5. Тест прав

- **Decision**: `supabase/tests/category_labels_test.sql`: колонка є й `default false`; `user`, `editor`, `moderator` — `update map_categories set show_labels = true` не змінює рядок (RLS: 0 рядків) ; `anon` — те саме; `admin` — змінює. Перевірка через лічильник змінених рядків / повторне читання від імені власника.
- **Rationale**: принцип VI; SC-004.

## Невідомих не лишилось.
