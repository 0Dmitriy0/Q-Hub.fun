---
name: wiki-publish-via-rpc
description: Довідник (роботи, транспорт) змінюється лише через wiki_decide/wiki_revert; роботи тепер у таблиці jobs, src/data/jobs.ts — запас
metadata:
  type: project
---

З 0057 (specs/043, 2026-11-05) правки «Робіт» і «Транспорту» йдуть через пропозиції `wiki_proposals`; публікують лише `admin` і `moderator` функцією `wiki_decide` (відкат — `wiki_revert`, повернути прибране — `wiki_unhide`). Прямий запис у `jobs` і `vehicles` — лише `admin` (раніше `vehicles` писав і `editor`).
- Роботи — у таблиці `public.jobs`; `src/data/jobs.ts` лишається запасом (сайт без бази, мітки робіт на мапі й у програмі).
- Новий розділ довідника = нове значення `section` у check-ах `wiki_proposals`/`wiki_versions`, гілка в `wiki_clean`, `wiki_snapshot`, `wiki_version_of`, `wiki_apply` і `FIELDS` у `src/lib/wiki.ts` (білий список має збігатися).
- Помилки бази — errcode `QH001…QH014` з людським текстом; сайт показує їх як є (`dbError`).
- Кнопки пропозицій ховаються, поки таблиць немає (`wikiReady()` у `src/lib/jobsData.ts`) — сайт можна викласти до міграції.
- SQL-тести локально — PGlite (Postgres у WASM) у scratchpad; psql-змінні (`:x`) він не вміє. У plpgsql `if … case … then … end then` — case брати в дужки.

**Why:** конституція 1.3.0, принцип II — без рішення модератора публічні дані не змінюються (SC-004).

**How to apply:** не додавати RLS-запис `moderator`/`editor` у таблиці довідника; нові поля — і в `wiki_clean`, і в `FIELDS`. Див. [[prod-migrations-gaps]].
