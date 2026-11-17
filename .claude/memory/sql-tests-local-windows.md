---
name: sql-tests-local-windows
description: SQL-тести (supabase/tests/run.sh) на цьому ПК не запускаються як є — немає Postgres і WSL; що спрацювало й де пастки
metadata:
  type: reference
---

На ПК власника немає ні Postgres, ні WSL, тож `supabase/tests/run.sh` сам не запуститься. Без локального прогону SQL-тести перевіряє лише CI (`deploy.yml`) на PR.

Що спрацювало 2026-11-17 (specs/091):
- портативні бінарники EDB: `postgresql-16.4-1-windows-x64-binaries.zip` у scratchpad;
- копія `run.sh` зі змінами: `BIN` на `pgsql/bin`; `initdb … -E UTF8 --no-locale`; `pg_ctl -o "-p $PORT"` (без `-k`); `psql -h localhost`;
- **пастка:** `psql -c "…кирилиця…"` у Git Bash перекодовується в cp1251 → `invalid byte sequence for encoding "UTF8": 0xf8`. Рядки `$P -c "…"` треба передавати через stdin (`$P <<< "…"`).

Повторні запуски цієї копії класифікатор auto-режиму заблокував. Якщо потрібен локальний прогін — попросити власника дозволити команду, а не обходити блок.

Пов'язане: [[tests-no-node-fs]], [[prod-migrations-gaps]].
