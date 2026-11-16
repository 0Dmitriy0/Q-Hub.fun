# Data Model: Назви на мапі від адміна

## `public.map_labels` (нова, міграція 0070)

| Колонка | Тип | Правила |
|---|---|---|
| id | bigint identity PK | |
| text | text not null | 1–40 символів після trim, без переносів рядка |
| x, y | double precision not null | у межах мапи (як `map_ring_ok`: x −6000…6800, y −4400…8500) |
| color | text not null default '#f4f1ec' | `^#[0-9a-f]{6}$` |
| font | text not null default 'roboto-condensed' | Fontsource id, `^[a-z0-9-]{2,40}$` (список — у коді, `labelFonts.ts`) |
| weight | int not null default 700 | 100…900, кратне 100 |
| outline_color | text not null default '#0d0d0d' | `^#[0-9a-f]{6}$` |
| outline_w | real not null default 3 | 0…20 (м гри; 0 — без обводки) |
| angle | real not null default 0 | −180…180 (градуси, проти годинникової — додатні) |
| size | real not null default 30 | 5…400 (висота літер у метрах гри) |
| created_by | uuid default auth.uid() | |
| created_at, updated_at | timestamptz default now() | updated_at — тригером |

RLS: `select` — усі (anon теж); `insert/update/delete` — `public.is_admin()`.

## `MapLabel` (клієнт, `src/lib/mapData.ts`)

`{ id, dbId, text, x, y, color, font, weight, outlineColor, outlineW, angle, size }` — з бази; таблиці ще немає → `[]` (мапа без назв, не падає). Входить у `MapData` → кешується в копії мапи програми (`mapCache`) для роботи без інтернету.

## Шрифт (у коді, `src/lib/labelFonts.ts`)

`{ id: 'roboto-condensed', name: 'Roboto Condensed', weights: [400, 700] }` — ~25 записів; лише з cyrillic subset.

## Похідне: межі напису

`labelBox(label, measure)` → 4 кути повернутого прямокутника в метрах гри і вісь-вирівняний прямокутник (для overlay і розбиття по частинах мапи радара).
