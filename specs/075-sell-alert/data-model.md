# Data Model (settings.json, лише на комп'ютері гравця)

| Ключ | Вигляд | Фіча |
|---|---|---|
| `watch` | `number[]` — id товарів, ≤ 50 | 075 |
| `bar.sellAlert` | `boolean`, типово `true` | 075 |
| `alertSent.sell` | `{ [itemId]: { at: ms, price, buyer, low?: true } }` | 075 |
| `bar.eventAlert` | `boolean`, типово `false` | 076 |
| `bar.eventIds` | `string[]` з id `EVENTS`, типово `['ufo']` | 076 |
| `alertSent.events` | `{ [eventId]: ms старту, про який сповіщено }` | 076 |

Правила:

- `alertSent.sell` чиститься від товарів, яких уже немає в `watch`.
- Бази, міграцій і RLS немає.
