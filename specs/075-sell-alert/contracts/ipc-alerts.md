# IPC: плашка ↔ головний процес (лише з вікна плашки)

| Канал | Аргументи | Відповідь |
|---|---|---|
| `bar-data` (є) | — | додано `watch: number[]`, `promo: { code, reward } \| null` (промокод Q-Hub; `null` — вимкнено); у `prices[]` — `itemId` |
| `bar-prefs` (є) | `{ sellAlert?, eventAlert?, eventIds? }` | як раніше; `eventIds` фільтрується до відомих id |
| `watch-toggle` | `itemId: number` | `number[]` — новий список; понад 50 — без змін |
| `watch-clear` | — | `[]` |
| `notify-test` | — | `boolean` — чи Windows підтримує сповіщення |

Чисті функції (`src/lib/alerts.ts`), усі приймають `now`:

- `sellDue(watch, prices, sent, now) → { note, sent, changed }`
- `eventDue(ids, sent, now) → { note, sent }`
- `note` — `{ title, body } | null`
