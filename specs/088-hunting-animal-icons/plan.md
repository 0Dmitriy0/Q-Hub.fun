# Implementation Plan: Тварини на полях полювання

**Branch**: `088-hunting-animal-icons` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/088-hunting-animal-icons/spec.md`

## Summary

У зони мапи (`map_areas`) додається список видів звірів — колонка `animals text[]`, обмежена 8 фіксованими id. Мапа сайту (а через спільний бандл і мапа програми) малює всередині поля полювання ряд маленьких іконок звірів із підказкою-назвою, а в картці поля — список. Адмін позначає звірів у наявній формі «Змінити зону». Мапа для гри отримує іконки звірів як звичайні мітки (`GamePin`) у центрі поля. Малюються 8 нових SVG-іконок звірів.

**Відкрите**: Q1 закрито — у кожного поля свій набір. Сам список «поле → звірі» дає власник; сід `map_hunting_animals.sql` пишеться за ним, до того поля показуються без звірів.

## Technical Context

**Language/Version**: TypeScript 5 (React 18, сайт), SQL (PostgreSQL / Supabase)

**Primary Dependencies**: Leaflet (мапа), Supabase JS; мапа для гри — `src/lib/gameMap.ts` (canvas → YTD)

**Storage**: Supabase, таблиця `public.map_areas` + нова колонка `animals`

**Testing**: vitest (`src/lib/huntAnimals.test.ts`), SQL-тест `supabase/tests/map_area_animals_test.sql`

**Target Platform**: сайт (браузер) і програма Electron (вбудований бандл сайту `build:app`)

**Project Type**: web-app + desktop-оболонка зі спільним UI

**Performance Goals**: ≤ 6 полів × ≤ 8 іконок = ≤ 48 додаткових маркерів — без помітного впливу

**Constraints**: власні іконки (принцип IV); запис лише `admin` через RLS (принцип II); без нового релізу для зміни даних (дані в базі)

**Scale/Scope**: 8 SVG, 1 міграція, 1 SQL-тест, 1 модуль чистої логіки, правки `MapPage`, `MapAreaDraw`, `GameMapExport`, `mapMarks`, `mapIcons`, запис у журналі

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Перевірка | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише відображення даних мапи, гри не торкається | ✅ |
| II. Права — у базі | `animals` — колонка `map_areas`, політика «admin write» вже є (0021); новий SQL-тест на anon/user/admin | ✅ |
| III. Знімки приватні | Знімки не використовуються | ✅ |
| IV. Власні дані | Іконки малюються з нуля; розподіл звірів — з гри / від власника, не з фан-сайтів | ✅ |
| V. Програма лише додає | Програма лише показує мапу, нічого не пише | ✅ |
| VI. Тести | SQL-тест прав + check; vitest на розміщення іконок у полігоні | ✅ |

Post-design re-check: без змін, порушень немає.

## Project Structure

### Documentation (this feature)

```text
specs/088-hunting-animal-icons/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── map-area-animals.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/
├── migrations/0069_map_area_animals.sql   # колонка animals + check
├── seed/map_hunting_animals.sql           # звірі 6 полів (після відповіді на Q1)
└── tests/map_area_animals_test.sql

public/icons/animals/                       # rabbit, cow, pig, coyote, deer, puma, panther, boar .svg

src/
├── lib/huntAnimals.ts (+ .test.ts)         # список видів, назви, розміщення іконок у полі
├── lib/mapData.ts                          # MapArea.animals
├── lib/mapMarks.ts                         # читання animals
├── data/mapIcons.ts                        # 8 іконок у готові
├── pages/MapPage.tsx                       # маркери звірів у полі, список у картці
├── components/MapAreaDraw.tsx              # вибір звірів у «Змінити зону»
├── components/GameMapExport.tsx            # звірі як GamePin
└── data/changelog.json                     # пункт у pending-пак
```

**Structure Decision**: усе в наявних модулях мапи; нова лише чиста логіка `huntAnimals.ts`. Програма отримує зміну через `build:app`, окремого коду в `desktop/` не треба.

## Complexity Tracking

Порушень немає.
