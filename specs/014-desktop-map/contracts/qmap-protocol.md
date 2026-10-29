# Contract: протокол `qmap://`

Вікно мапи відкрите з `file://`, а сайт не віддає CORS (research R2). Файли мапи вікно бере через `qmap://`.

## Запит

`qmap://site/map/<шлях>?v=<MAP_V>` — `<шлях>` лише з `[A-Za-z0-9_./-]`, без `..`; інше — 400.

Приклади: `qmap://site/map/5/15/20.webp?v=2026-10-22c`, `qmap://site/map/v/12_30.bin?v=…`, `qmap://site/map/game/names.bin?v=…`.

## Відповідь

1. У кеші є файл з тим самим `v` → віддати з диска (без мережі).
2. Інакше → `GET <cfg.site>/map/<шлях>?v=<v>`:
   - 200 → записати в кеш (`index.json`: `v`, `Last-Modified`), віддати;
   - 404 → 404 (тайла немає — вікно показує море);
   - помилка мережі → є старий файл (інший `v`) — віддати його; нема — 404.
3. `Content-Type` — за розширенням: `.webp` image/webp, `.json` application/json, `.bin` application/octet-stream.

## Гарантії

- Читає лише `/map/…` сайту з `cfg.site`; інші хости й шляхи недоступні.
- Нічого не надсилає, крім звичайного GET файлу мапи.
- Кеш — `%APPDATA%\Q-Hub\map\site\`, поряд з еталоном F9 (`%APPDATA%\Q-Hub\map\export.bin`).
