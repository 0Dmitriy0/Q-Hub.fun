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

Поля CSV (власник, 31.10): `isHidden` = ексклюзив, `donate` = ціна в донатній валюті (тоді `price` = donate × 1000) —
залиті `supabase/seed/vehicles_flags.sql` за кодом моделі.

`uaType` (власник, 31.10): 1 — можна український номер, 0 — ні → `vehicles.ua_plate` (0044). Електро — поле CSV
`electric`, НЕ `fuelType` (електромобілі мають fuelType 0); звірка з нашими 35 електро — збіг повний. `fuelType` 3 —
дизель (Touareg, T6, V250, X5 E53) → `fuel = 'diesel'`; 0/1/2 — найімовірніше марки бензину (0 — фургони й старі,
2 — суперкари), не підтверджено. Залито `supabase/seed/vehicles_fuel_ua.sql`.

**Why:** у розробників ще запитано `title` для авто, значення `price` (у нас R1M 3 240 000, у файлі 2 700 000 — ×1,2)
і чи постійний шлях `/test/`. Ціни з CSV не заливали, доки не відповіли.

**How to apply:** коли прийде `title` — дозіставити решту за назвою; якщо шлях CDN зміниться — правити лише `gamePhoto`
у `src/lib/carMatch.ts`.
