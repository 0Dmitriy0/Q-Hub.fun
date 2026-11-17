# Контракт: Discord DM у функції `discord-bot`

Доповнює `specs/060-discord-bot/contracts/discord-bot-function.md`.

## Крок `dm` у дії `tick`

Виклик: pg_cron щохвилини (`x-sync-secret`), як і решта `tick`. Окремої дії й нового розкладу немає.

1. `notification_dm_batch(20)`; якщо `discord_bot.dm_on = false` → кожному `failed` з текстом «надсилання в Discord вимкнено». Без `DISCORD_BOT_TOKEN` функція не стартує, сповіщення лишаються «в черзі».
2. Немає `discord_user_id` → `failed`, «акаунт Discord не знайдено».
3. `POST /users/@me/channels` `{ "recipient_id": "<id>" }` → `channel.id`.
4. `POST /channels/{channel.id}/messages`:
   ```json
   { "embeds": [{ "title": "<title>", "description": "<body>\n\n🎁 Приз: <prize>", "url": "https://<сайт>/" }],
     "allowed_mentions": { "parse": [] } }
   ```
   Рядок призу — лише якщо приз не порожній.
5. Результат → `notification_dm_result`:

| Відповідь Discord | Статус | `discord_error` |
|---|---|---|
| 200 | `sent` | '' |
| 403 + code `50007` | `failed` | «Закриті особисті повідомлення або немає спільного сервера з ботом» |
| 404 / code `10013` | `failed` | «Акаунт Discord не знайдено» |
| 401 | `retry` (+ `discord_bot.last_error`) | «Бот не авторизований» |
| 429, 5xx, мережа | `retry` | «Discord тимчасово недоступний» |
| 403 без коду | `failed` | як `50007` |
| після 5 спроб (паузи 1, 2, 4, 6 хв ≈ 13 хв) | `failed` | останній текст + « (спроби вичерпано)» |

Помилка одного DM не зупиняє решту пакета й інші кроки `tick` (ціни, мітки). Токен не потрапляє ні в базу, ні в лог помилок.

## Тести (vitest, підміна `fetch`)

`supabase/functions/discord-bot/dm.test.ts`: успіх; `50007`; `10013`; `429` з повтором; порожній приз не додає рядок; `allowed_mentions` завжди порожній.
