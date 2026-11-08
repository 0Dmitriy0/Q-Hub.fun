---
name: wiki-publish-via-rpc
description: Довідник (роботи, транспорт, мітки, гайди) змінюється лише через wiki_decide/wiki_revert; роботи в jobs, гайди в wiki_guides; код — запас
metadata:
  type: project
---

З 0057 (specs/043, 2026-11-05) правки «Робіт» і «Транспорту» йдуть через пропозиції `wiki_proposals`; публікують лише `admin` і `moderator` функцією `wiki_decide` (відкат — `wiki_revert`, повернути прибране — `wiki_unhide`). Прямий запис у `jobs` і `vehicles` — лише `admin` (раніше `vehicles` писав і `editor`).
- Роботи — у таблиці `public.jobs`; `src/data/jobs.ts` лишається запасом (сайт без бази, мітки робіт на мапі й у програмі).
- Новий розділ довідника = нове значення `section` у check-ах `wiki_proposals`/`wiki_versions`, гілка в `wiki_clean`, `wiki_snapshot`, `wiki_version_of`, `wiki_apply` і `FIELDS` у `src/lib/wiki.ts` (білий список має збігатися).
- Помилки бази — errcode `QH001…QH014` з людським текстом; сайт показує їх як є (`dbError`).
- Кнопки пропозицій ховаються, поки таблиць немає (`wikiReady()` у `src/lib/jobsData.ts`) — сайт можна викласти до міграції.
- SQL-тести локально: PGlite (`@electric-sql/pglite`) або справжній Postgres 16 з npm `@embedded-postgres/windows-x64` + `pg`; запускач мусить сам підставляти psql `gset`/`:x` і вклеювати `i`, інакше стан бази не той, що в CI, і вади не ловляться. Сервер — з `lc_messages = C` (тести чекають англійських помилок). У plpgsql `if … case … then … end then` — case брати в дужки.
- Тести перезапускають старі міграції через `i` (напр. `map_batches_test.sql` — 0033), і ті повертають старі політики: міграція, що змінює ту саму політику, має бути `i`-нута там же після старої (0060 після 0033). На справжній базі повтор 0033 так само відкотить фільтр схованих міток — після нього запускати 0060.
- Ланцюжок функцій довідника: найсвіжіші `wiki_clean`/`wiki_snapshot`/`wiki_version_of`/`wiki_apply`/`wiki_decide` — у 0065 (гайди, розділ `guide`, таблиця `wiki_guides` — `guides` зайнята інструкцією 0035). Повтор 0059/0060 стирає гілку `guide` → після них — 0065 (у `map_batches_test.sql` так і зроблено). Новий розділ — копіювати функції з 0065.
- Запускач SQL-тестів на `pg` (2026-11-08): одне з'єднання на кожен `$P -f` (інакше `request.jwt.claim.sub` протікає між файлами й сіди ламаються), `initdb --locale-provider=builtin --builtin-locale=C.UTF-8` (з `--locale=C` `lower()` не знає кирилиці), у `\gset` — зберегти рядок і підставляти `:x`/`:'x'`. Скрипт писати через Write, не heredoc (`\b` стає символом backspace — [[node-heredoc-backslash]]).

**Why:** конституція 1.3.0, принцип II — без рішення модератора публічні дані не змінюються (SC-004).

**How to apply:** не додавати RLS-запис `moderator`/`editor` у таблиці довідника; нові поля — і в `wiki_clean`, і в `FIELDS`. Див. [[prod-migrations-gaps]].
