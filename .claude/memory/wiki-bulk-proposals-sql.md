---
name: wiki-bulk-proposals-sql
description: Масово подати пропозиції довідника SQL-ом — ліміт max_pending рахує й рядки того ж insert; обгортати в do-блок
metadata:
  type: project
---

Щоб подати багато правок довідника разом (напр. інфо про роботи від сім'ї, 2026-11-08), власнику дається SQL з `insert into public.wiki_proposals … author = перший admin`. Тригер `wiki_proposal_new` рахує pending автора разом із рядками, вставленими раніше в тому ж запиті, тож 11-й рядок падає з QH002 і відкочує все.

**Why:** ліміт `wiki_settings.max_pending` (за замовчуванням 10) — захист від спаму гравців, а не від адміна.

**How to apply:** обгортати вставку в `do $wrap$ … $wrap$`: запам'ятати `max_pending`, підняти до 100, вставити, повернути. Дані брати проти поточної бази (REST з публічним ключем `desktop/src/config.json`), лише змінені поля і `base_version` = поточна версія — див. [[wiki-publish-via-rpc]].
