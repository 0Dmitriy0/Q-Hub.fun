# Contract: функція `discord-bot` (060)

`POST {SUPABASE_URL}/functions/v1/discord-bot`, тіло `{ "action": "...", ... }`.

Доступ: `x-sync-secret: <DISCORD_SYNC_SECRET>` (cron, CI) **або** `Authorization: Bearer <сесія admin>` (адмінка). Інакше —
403. Секрети функції: `DISCORD_BOT_TOKEN`, `DISCORD_SYNC_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.

| action | Хто | Що робить | Відповідь |
|---|---|---|---|
| `tick` | pg_cron щохвилини | якщо `prices_on` і є події старші за `window_min` хв і ліміт години не вичерпано — збирає всі події в черзі, публікує повідомлення цін (по 10 embed), `crosspost`, позначає події `post_key` | `{ posted: n, waiting: n, reason? }` |
| `drafts` | CI після деплою | `{ changelog: Entry, site: Entry? }` → чернетки за `source_ref`, наявні не чіпає | `{ created: [...], skipped: [...] }` |
| `send` | admin | `{ draft_id }` → публікує чернетку в канал новин + `crosspost`; вдруге — `{ already: true }` | `{ message_id }` |
| `test` | admin | `{ channel: 'prices' \| 'news' }` → пробне повідомлення; помилка прав — зрозумілий текст (US3 AC3) | `{ ok, error? }` |
| `status` | admin | бот на зв'язку (`GET /users/@me`), сервери бота, назви й права каналів | `{ online, guilds, channels }` |

Помилки Discord: `429` → чекати `retry_after` і повторити один раз у межах виклику, далі — наступний `tick`; `403/404`
каналу → `last_error` «Дай боту право писати в #…» і публікація лишається в черзі; `discord_posts.status = 'failed'`
з текстом. Повторна спроба з тим самим `key` не створює друге повідомлення (якщо `message_id` уже є — лише `crosspost`).
