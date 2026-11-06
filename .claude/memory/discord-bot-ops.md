---
name: discord-bot-ops
description: Як влаштований і де налаштований Discord-бот Q-Hub (specs/060) — секрети, розклад, деплой, підводні камені
metadata:
  type: project
---

Стан на 2026-11-04: бот публікує ціни скупників, кожен скупник — у свій канал (0056), без каналу — нікуди.
- Функція Supabase `discord-bot`; деплой: `npx.cmd supabase functions deploy discord-bot --project-ref mcuolznwwvptffcueswm --use-api --no-verify-jwt --yes` (`--yes` обов'язковий з агента).
- Секрети функції: `DISCORD_BOT_TOKEN`, `DISCORD_SYNC_SECRET` (той самий — у GitHub Secrets і у Vault бази як `discord_sync_secret`). Відбиток значення: `supabase secrets list` (SHA-256) ↔ `sha256(decrypted_secret)` у SQL — так звіряти без розкриття.
- Розклад: pg_cron `discord-tick` щохвилини → `net.http_post` з `x-sync-secret`; файл `supabase/sql/discord_cron.sql` (не міграція). Перевірка — `net._http_response`: `200 {"posted":0,"reason":"вимкнено"}` поки ціни вимкнені.

**Why:** перший запуск зламався двічі — Ctrl+H у SQL Editor не замінив `<СЕКРЕТ>` (у Vault лежав сам заповнювач, 403), а SQL, скопійований з термінала чи разом з поясненнями з чату, ламався.

**How to apply:** SQL власнику класти в буфер обміну з файлу (Windows Forms Clipboard), а не просити копіювати з чату; секрети генерувати в буфер чи тимчасовий файл у scratchpad і вставляти в SQL самому, файл одразу видаляти. Агентові заборонено писати в секрети Supabase/GitHub (auto mode) — це робить власник.
