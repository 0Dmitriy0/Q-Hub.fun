# Contract: база (Supabase), що бачать сайт і програма

## Читання — без змін форми
| Запит | До | Після |
|---|---|---|
| `buyers?select=id,name,…&order=sort` | 10 рядків, є `meat` | 9 рядків, `meat` немає |
| `buyer_items?select=buyer_id,item_id,…` | 8 рядків `meat` | ці 8 — з `buyer_id = hide` |
| `price_history?buyer_id=in.(…)` | точки `meat` | ті самі точки з `hide` |
| `buyer_next_change` | 2 рядки (`hide`, `meat`) | 1 рядок `hide` |
| `buyer_aliases?select=*` | — | `[{ alias: 'meat', buyer_id: 'hide' }]` (anon і authenticated) |

## Запис — сумісність зі старими клієнтами
| Виклик | Результат |
|---|---|
| `insert price_reports { kind: 'buyer', buyer_id: 'meat', item_id: <м'ясо>, price }` | приймається, зберігається з `buyer_id = 'hide'` |
| `insert price_reports { buyer_id: 'hide', item_id: <м'ясо>, … }` | приймається |
| `rpc set_next_change { p_buyer: 'meat', p_at }` | змінює таймер `hide` |
| `insert/update/delete buyer_aliases` від anon, user, editor, moderator, admin | відмова (немає прав) |
| `rpc merge_buyer` від anon чи authenticated | відмова (немає прав) |

Помилки, які бачить гравець, — ті самі, що й раніше («У цього скупника немає такого товару» тощо).
