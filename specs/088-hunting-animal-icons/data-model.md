# Data Model: Тварини на полях полювання

## Вид звіра (фіксований словник, у коді `src/lib/huntAnimals.ts`)

| id | Назва на мапі | Іконка |
|---|---|---|
| rabbit | Заєць | `/icons/animals/rabbit.svg` |
| cow | Корова | `/icons/animals/cow.svg` |
| pig | Свиня | `/icons/animals/pig.svg` |
| coyote | Койот | `/icons/animals/coyote.svg` |
| deer | Олень | `/icons/animals/deer.svg` |
| puma | Пума | `/icons/animals/puma.svg` |
| panther | Пантера | `/icons/animals/panther.svg` |
| boar | Кабан | `/icons/animals/boar.svg` |

Порядок у таблиці — порядок показу на мапі й у формі.

## `public.map_areas` (наявна, міграція 0021) — нова колонка

| Колонка | Тип | Правила |
|---|---|---|
| animals | `text[] not null default '{}'` | кожен елемент ∈ 8 id вище; без повторів; ≤ 8 елементів |

- Check `map_areas_animals_ok`: `animals <@ array['rabbit','cow','pig','coyote','deer','puma','panther','boar']` і `cardinality(animals) = cardinality(array(select distinct unnest(animals)))`.
- Колонка є в усіх зонах, але інтерфейс пропонує її лише для категорії `hunting-fields`.
- RLS: без змін — читають усі, пишуть лише `admin` (`map_areas: admin write`).

## `MapArea` (клієнт, `src/lib/mapData.ts`)

`animals: AnimalId[]` — з бази; відсутня колонка (міграцію ще не застосовано) → `[]`.

## Стан

Поле без звірів → лише контур (як зараз). Адмін змінює список → після перезавантаження мапи всі бачать нові іконки.
