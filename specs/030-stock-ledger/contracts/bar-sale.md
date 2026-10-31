# Contract: пропозиції списання (плашка ↔ main)

Канали — як наявні `quick-*`, `hist-*`: лише з вікна плашки (`fromBar(e)`), інакше `null`.

## main → плашка

| Канал | Дані | Коли |
|---|---|---|
| `bar-data` (наявний) | `+ sales: Sale[]` | при відкритті плашки: усі `pending` |
| `sale-new` (подія) | `Sale` | автооблік записав продаж, плашка відкрита |

```ts
interface Sale { txId: string; amount: number; buyerId: string | null; buyer: string | null; prices: Record<number, number> | null; at: number }
```

Плашка сама рахує кандидата: `saleGuess(sale, catalog, stock)`.

## плашка → main

| Канал | Аргументи | Відповідь |
|---|---|---|
| `sale-confirm` | `txId, lines: { item: string; qty: number; price: number; farm: number }[]` | `null` — успіх; рядок — помилка для гравця |
| `sale-decline` | `txId` | — |
| `sale-undo` | `txId` | `null` / помилка; лише ≤ 10 с після `sale-confirm` |

Перевірки в main:
- `txId` має бути серед `pending` (чи `confirmed` ≤ 10 с для `undo`);
- рядки: `qty > 0`, `0 ≤ farm ≤ qty`, `price ≥ 0`, `item` 1–80 символів;
- `Σ (qty × price)` має дорівнювати `amount` з точністю до 1 $, інакше відмова «Сума не збігається з продажем».

Запис: угоди `deals` з `tx_id = txId` (див. data-model). Помилка посередині → уже вставлені угоди цього `txId` видаляються, пропозиція лишається `pending`.
