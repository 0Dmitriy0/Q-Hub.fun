# Contract: фіксовані ціни скупника

## Читання (сайт і програма, роль anon/authenticated)

```text
buyers: id, name, sort, image_url, next_change_at, fixed_prices, sale_limit, sale_limit_unit
buyer_items: buyer_id, item_id, price, price_at, min_price, max_price, items(name, unit, image_url, aliases)
```

Клієнт для `fixed_prices = true`:

- не показує таймер, поле «вписати час», межі мін–макс і позначку «нова: X $ · k з N»;
- показує «фіксована ціна» і, якщо задано, «Ліміт продажу: {sale_limit} {sale_limit_unit}».

## Запис

| Дія | Хто | Шлях | Результат для fixed |
|---|---|---|---|
| увімкнути/вимкнути `fixed_prices`, змінити ліміт | staff | `update buyers` (RLS) | ок. Гравцю — відмова RLS |
| поставити ціну | staff | наявне «Оновити ціну» (ручне внесення) | одразу поточна + точка історії |
| голос гравця з сайту | гравець | `insert price_reports` | `exception` «фіксовані ціни…» |
| голос із програми | будь-хто | `insert price_reports` (source desktop) | `exception`. Черга програми: `denied` → запис видалено |
| час наступної зміни | будь-хто | `rpc set_next_change` | `exception` «У цього скупника фіксовані ціни» |
| розбіжність з екрана | програма | `rpc report_limit_mismatch(buyer, item, price)` | рядок у `buyer_limit_reports` (price ≠ поточна) |

## Програма: `pricePicker` (desktop/src/pricescan.cjs)

Вхід: рядок каталогу з новим полем `fixed: boolean`.

- `fixed && price === last` → товар підтверджений для покриття, у `out` нічого не йде.
- `fixed && price !== last`: зчитка з `score ≥ ODD_SURE` ODD_TIMES разів за відкриття → один елемент у `odd` (→ `report_limit_mismatch`), у `out` нічого не йде.
- Стан покриття для фіксованого скупника не породжує підказки «прокрути / дочитай» на смужці.
