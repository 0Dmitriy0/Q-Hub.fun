# Implementation Plan: Назви на мапі від адміна

**Branch**: `089-admin-map-labels` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/089-admin-map-labels/spec.md`

## Summary

Старий шар назв (трикутники Hydra: `names.bin`, `names.zip`, `namesLayer`) прибирається. Натомість — таблиця `map_labels` (текст, місце, колір, шрифт, обводка, кут, розмір у метрах), яку пише лише `admin`; старі 123 назви видаляються повністю (разом із `src/data/mapLabels.json`), стартового набору немає.

Один рендерер `renderLabel()` малює напис на canvas справжнім Google-шрифтом (через `FontFace`) з обводкою й поворотом. Його результат іде всюди однаково:
- **мапа сайту й програми** — `L.imageOverlay` у межах напису в метрах (масштабується з мапою);
- **текстури мапи для гри (пауза)** — той самий canvas на текстурі;
- **радар-мінікарта гри** — пікселі canvas → смужки-чотирикутники, як значки міток (`iconRuns` / `IconMesh`), у шар `tile_3_N` (де були назви).

Так вигляд на сайті, у паузі й на радарі збігається, а нових бібліотек (розбір шрифтів, тріангуляція) не треба.

## Technical Context

**Language/Version**: TypeScript 5 (React 18), SQL (Supabase), CommonJS (desktop main)

**Primary Dependencies**: Leaflet; Canvas 2D + `FontFace`; шрифти — Google Fonts через Fontsource CDN (`cdn.jsdelivr.net/fontsource/fonts/<id>@latest/<subset>-<weight>-normal.woff2`); архів гри — наявні `IconMesh`/`meshFiles`/`toSlots` у `src/lib/gameMap.ts`

**Storage**: нова таблиця `public.map_labels` (міграція `0070`), порожня на старті

**Testing**: vitest (геометрія напису, розбиття смужок по частинах мапи), SQL-тест прав і обмежень

**Target Platform**: сайт, програма (той самий бандл), архів для гри (RAGE MP / GTA V мінікарта)

**Project Type**: web-app + desktop-оболонка

**Performance Goals**: до ~200 написів на мапі без підгальмовувань (по одному image overlay на напис, рендер один раз на напис і тему); архів — у межах наявного ліміту 60 000 вершин на файл (дробити на `tile_3_N`)

**Constraints**: лише `admin` пише (RLS); шрифт без інтернету → запасний; в архів — лише після завантаження шрифту

**Scale/Scope**: 1 таблиця, ~25 шрифтів, редактор написів на мапі сайту, заміна шару назв у 4 місцях (MapPage, GamePreview, gameMap textures, gameMap vector), програма (qmap.cjs — прибрати `names.bin`)

## Constitution Check

| Принцип | Перевірка | Стан |
|---|---|---|
| I. Зовнішній інструмент | Лише дані мапи й файли архіву, які гравець ставить сам (як і досі) | ✅ |
| II. Права — у базі | `map_labels`: читають усі, пишуть лише `admin` (RLS) + SQL-тест на anon/user/editor/admin | ✅ |
| III. Знімки приватні | Не використовуються | ✅ |
| IV. Власні дані | Написи ставить адмін; шрифти — відкриті Google Fonts | ✅ |
| V. Програма лише додає | Програма лише показує написи | ✅ |
| VI. Тести | SQL-тест прав; vitest на геометрію й розбиття по частинах мапи | ✅ |

Post-design re-check: без змін.

## Project Structure

### Documentation (this feature)

```text
specs/089-admin-map-labels/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── map-labels.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/
├── migrations/0070_map_labels.sql
└── tests/map_labels_test.sql

src/
├── lib/labelFonts.ts                     # список шрифтів (Fontsource id, назва, вага) + завантаження FontFace
├── lib/mapLabel.ts (+ .test.ts)          # renderLabel(), межі напису в метрах, label → смужки
├── lib/mapData.ts / mapMarks.ts          # MapLabel, завантаження з бази, шар 'names'
├── components/MapLabelEdit.tsx           # редактор напису (адмін): текст, колір, шрифт, обводка, кут, розмір
├── pages/MapPage.tsx                     # написи замість namesLayer; ручки переносу/повороту/розміру
├── components/GamePreview.tsx            # написи замість namesLayer
├── components/GameMapExport.tsx          # кількість «Назв» з бази; передати написи в архів
├── components/MapShot.tsx                # «Скрін» — написи замість names.bin
├── lib/gameMap.ts                        # textures: renderLabel на текстурі; vector: labelFiles → tile_3_N; прибрати names.bin/names.zip
├── lib/mapVector.ts                      # прибрати namesLayer
└── data/changelog.json

desktop/src/qmap.cjs                      # не тягнути names.bin
public/map/game/names.bin, names.zip, src/data/mapLabels.json   # видалити
```

**Structure Decision**: нові модулі — `mapLabel.ts` (чиста логіка + рендер) і `labelFonts.ts`; решта — заміна шару назв у наявних місцях.

## Complexity Tracking

Порушень немає.
