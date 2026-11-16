# Contract: написи мапи

## База

```
GET    map_labels?select=*                        → усі (anon теж)
POST   map_labels { text, x, y, color, font, weight, outline_color, outline_w, angle, size }   → лише admin
PATCH  map_labels?id=eq.<id> { …будь-які поля }  → лише admin
DELETE map_labels?id=eq.<id>                       → лише admin
```

| Хто | insert / update / delete |
|---|---|
| anon, user, editor, moderator | заборонено (RLS: помилка або 0 рядків) |
| admin | дозволено; порушення меж (текст 0 чи > 40 символів, колір не `#rrggbb`, size поза 5…400, angle поза ±180, точка поза мапою) → check_violation |

## Модулі

- `labelFonts.ts`: `LABEL_FONTS`, `loadLabelFont(id, weight): Promise<boolean>` (true — шрифт готовий; false — запасний).
- `mapLabel.ts`:
  - `labelBox(l, textWidthM)` → `{ corners: [x,y][4], x0, y0, x1, y1 }` у метрах;
  - `renderLabel(l, pxPerM): { canvas, box }` — напис з обводкою й поворотом; прозоре тло;
  - `labelRuns(canvas, box)` → смужки в метрах гри з кольором (для `IconMesh`);
  - `splitBySupertile(runs)` → `Map<'c_r', runs>` (центр смужки → `supertileOf`).
- `gameMap.ts`: `buildGamePack(pins, { …, labels?: MapLabel[] })`; шар `names` означає «написи адміна» — на текстурах і в `tile_3_N` вектора; `names.zip` / `names.bin` більше не читаються.

## Інтерфейс адміна (мапа сайту)

- Інструменти адміна → «Новий напис» → клік по мапі → форма + живий напис.
- Ручки: центр — перенести; кут — поворот + розмір. Числові поля: кут (°), розмір (м), товщина обводки (м).
- Клік по напису (адмін) → «Змінити / перенести», «Видалити напис» (підтвердження: «Видалити напис „ФЕРМА“?»).
