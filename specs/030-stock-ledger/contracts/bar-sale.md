# Contract: пропозиції списання (плашка ↔ main)

Канали — як наявні `quick-*`, `hist-*`: лише з вікна плашки (`fromBar(e)`), інакше `null`.

## main → плашка

| Канал | Дані | Коли |
|---|---|---|
| `bar-data` (наявний) | `+ sales: Sale[]` | при відкритті плашки: усі `pending` |
| `sale-new` (подія) | `Sale` | автооблік записав продаж, плашка відкрита |

```ts
interface Sale { txId: string; amount: number; buyerId: string | null; buyer: string | null; items: { item: string; unit: string; price: number }[]; at: number }
```

`items` — товари цього скупника: ціна з вікна, що щойно читалось, інакше з сайту (main зводить їх у `saleView`). Скупник не впізнаний — `items: []`, і плашка пропонує вибір зі складу.

Плашка сама рахує кандидата: `saleGuess(sale.amount, sale.items, stock)`.

## плашка → main

| Канал | Аргументи | Відповідь |
|---|---|---|
| `sale-confirm` | `txId, lines: { item: string; qty: number; price: number; farm: number }[]` | `null` — прийнято (відправлено або в черзі); рядок — помилка для гравця |
| `sale-decline` | `txId` | — |
| `sale-undo` | `txId` | `null` / помилка; лише ≤ 10 с після `sale-confirm` |

Перевірки в main:
- `txId` має бути серед `pending` (чи `confirmed` ≤ 10 с для `undo`);
- рядки: `qty > 0`, `0 ≤ farm ≤ qty`, `price ≥ 0` (ціле), `item` 1–80 символів;
- `|Σ (qty × price) − amount| ≤ max(1, Σ qty)` — інакше відмова «Сума не збігається з продажем». Запас `Σ qty` покриває округлення ціни при ручному виборі.

**Ручний вибір**: гравець обирає товар і кількість, а ціну плашка рахує як `round(amount / qty)`. Тож ручне списання проходить перевірку, навіть коли ціна в скупника щойно змінилась.

## Запис (принцип V)

- Кожна угода має стабільний `external_id = sale:<txId>:<n>:<op>` (`n` — номер рядка, `op` — `farm` | `sell`). Вставка — `upsert` з `onConflict: 'character_id,external_id'`, `ignoreDuplicates`: повторна відправка не дає дубля.
- Немає зв'язку → угоди лягають у чергу на диску (`%APPDATA%\Q-Hub\sales-out.json`) і відправляються кожні 30 с та при старті. Пропозиція вважається `confirmed`.
- `sale-undo` до відправки прибирає угоди з черги. Після відправки — видаляє угоди з `tx_id = txId` і `external_id like 'sale:<txId>:%'`; без зв'язку — помилка «Немає зв'язку — скасуй у „Угодах“».
