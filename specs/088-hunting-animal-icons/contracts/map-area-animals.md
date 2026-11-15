# Contract: звірі поля полювання

## База (PostgREST через Supabase JS)

**Читання** (усі, anon теж):

```
GET map_areas?select=*  →  [{ id, category_id, name, note, ring, animals: ["deer","boar"] , … }]
```

**Запис** (лише `admin`):

```
PATCH map_areas?id=eq.<id>  { animals: ["deer","boar"], name, note, ring, category_id }
```

| Хто | Результат |
|---|---|
| anon, `user`, `editor`, `moderator` | 0 рядків змінено (RLS) |
| `admin`, валідний список | 200, рядок оновлено |
| `admin`, невідомий id (`"wolf"`) або повтор | помилка check `map_areas_animals_ok` |

## Чиста логіка `src/lib/huntAnimals.ts`

- `ANIMALS: { id: AnimalId; name: string; icon: string }[]` — 8 видів у порядку показу.
- `isAnimal(s: string): s is AnimalId`.
- `animalSpots(ring: [number, number][], n: number, stepM: number): [number, number][]` — `n` точок у координатах гри всередині контуру, без перетинів (відстань між сусідніми ≥ `stepM`), детерміновано.

## Інтерфейс

- Мапа: маркер звіра — підказка з назвою (`Пума`); картка поля — рядок іконок із назвами.
- Форма «Змінити зону» (категорія `hunting-fields`): 8 перемикачів з іконкою й назвою, `aria-pressed`.
