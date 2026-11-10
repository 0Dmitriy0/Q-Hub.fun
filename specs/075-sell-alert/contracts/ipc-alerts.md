# IPC: плашка ↔ головний процес (лише з вікна плашки)

| Канал | Аргументи | Відповідь |
|---|---|---|
| `bar-data` (є) | — | додано `watch: number[]`, `market: { hours, ends } \| null` (таймер обраного персонажа); у `prices[]` — `itemId` |
| `bar-prefs` (є) | `{ sellAlert?, eventAlert?, eventIds? }` | як раніше; `eventIds` фільтрується до відомих id |
| `watch-toggle` | `itemId: number` | `number[]` — новий список; понад 50 — без змін |
| `watch-clear` | — | `[]` |
| `market-set` | `hours` (число чи рядок) | `{ market: { hours, ends } }` або `{ error }` |
| `market-clear` | — | `{ market: null }` |
| `notify-test` | — | `boolean` — чи Windows підтримує сповіщення |

Чисті функції (`src/lib/alerts.ts`), усі приймають `now`:

- `sellDue(watch, prices, sent, now) → { note, sent, changed }`
- `eventDue(ids, sent, now) → { note, sent }`
- `marketHours(v) → number | null`, `marketStart(hours, now)`, `marketDue(t, now) → { t, kind: 'warn' | 'done' | null, late }`, `marketNote(kind, t, now, late, who?)`, `marketLeft(t, now)`
- `note` — `{ title, body } | null`
