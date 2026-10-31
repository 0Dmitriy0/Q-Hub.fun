---
name: vehicle-model-codes
description: Транспорт: код моделі гри (vehicles.model) і фото з CDN гри; звідки взялись і що ще не зіставлено
metadata:
  type: project
---

31.10.2026 розробники гри дали `configvehicle.csv` (авто, **без `title`** — лише код моделі) і `configvehicle (1).csv`
(мото, з `title`), плюс фото: `https://1ff720c613a55d1a.cdn.express/vehicles/test/${Model}.png` (перша літера велика).
Код зберігається у `vehicles.model` (міграція 0042), коди залиті `supabase/seed/vehicles_model.sql` (310 записів):
мото — за назвою, авто — порівнянням фото CDN з `public/vehicles/*.webp` і ручною звіркою власника.

Не зіставлено: 19 записів (немає пари), 7 кодів, що вийшли на двох записах (ae86, 69charger, evo6, e63w213, taycan,
agerars, fordgt), vmax (на CDN 404). `realName` у CSV буває хибним (zx10rr = «BMW i8 Roadster», а це мотоцикл).

**Why:** у розробників запитано `title` для авто, значення `price` (у нас R1M 3 240 000, у файлі 2 700 000 — ×1,2),
`fuelType`/`uaType`/`donate`/`isHidden` і чи постійний шлях `/test/`. Ціни з CSV не заливали, доки не відповіли.

**How to apply:** коли прийде `title` — дозіставити решту за назвою; якщо шлях CDN зміниться — правити лише `gamePhoto`
у `src/lib/carMatch.ts`.
