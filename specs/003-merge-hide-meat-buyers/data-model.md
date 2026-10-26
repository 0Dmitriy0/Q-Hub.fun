# Data Model: Один скупник «Шкури»

## Змінюється

### buyers (наявна)
| Поле | Зміна |
|---|---|
| рядок `meat` | видаляється після перенесення |
| `hide.next_change_at`, `hide.next_change_by` | пізніший з `hide`/`meat` (R4) |

### buyer_items (наявна, PK `buyer_id, item_id`)
- 8 рядків `meat` → `buyer_id = 'hide'`; `min_price`, `max_price`, `price`, `price_at`, `price_by` — без змін.
- Рядок `meat`, чий товар уже є в `hide`, видаляється (R2); у `hide` лишається свій.

### price_history (наявна)
- Усі точки `meat` → `buyer_id = 'hide'`. Нових точок не з'являється (тригер історії реагує лише на зміну `price`).

### price_reports (наявна)
- Усі повідомлення `meat` → `buyer_id = 'hide'` (важливо для правила «3 гравці за 48 год», FR-003).

## Нове

### buyer_aliases
| Поле | Тип | Правила |
|---|---|---|
| `alias` | text, PK | старий id скупника, якого вже немає в `buyers` |
| `buyer_id` | text, FK → `buyers` on delete cascade | куди тепер іде все, що приходить з `alias` |

- Читають усі (anon, authenticated) — програмам це не потрібно, але приховувати нічого.
- Писати не може ніхто з клієнтів: лише міграції (принцип II — довідник змінює admin; тут навіть admin з сайту не потрібен).
- Початковий рядок: `('meat', 'hide')`.

### merge_buyer(p_from text, p_to text) — функція міграції
- Переносить `buyer_items` (з R2), `price_history`, `price_reports`, таймер (R4), додає псевдонім `p_from → p_to`,
  видаляє `p_from`. Якщо `p_from` немає — нічого не робить (повторний запуск, FR-008).
- Викликати можуть лише власник бази й міграції (`revoke … from public, anon, authenticated`).

## Поведінка на вставці

```
price_reports insert (buyer_id = X)
  → price_reports_alias  (before insert): X ∈ buyer_aliases ? buyer_id := buyer_aliases.buyer_id
  → price_reports_check  (before insert): шукає товар у buyer_items за новим buyer_id
  → FK buyers            : ok
  → price_reports_apply  (after insert)
set_next_change(p_buyer = X, …) → X розв'язується через buyer_aliases перед update buyers
```
