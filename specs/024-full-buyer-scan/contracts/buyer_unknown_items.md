# Contract: `public.buyer_unknown_items`

Назви товарів, які програма бачить у вікні скупника, але яких немає в Q-Hub. Лише пропозиції для адміна.

## Права (RLS)

| Роль | select | insert | update | delete |
|---|---|---|---|---|
| `anon` | ✗ | ✗ | ✗ | ✗ |
| `authenticated` (`user`, `editor`, `moderator`) | ✗ | ✗ напряму — лише через `report_unknown_item` | ✗ | ✗ |
| `admin` (`is_admin()`) | ✓ | ✓ | ✓ | ✓ |

Повтор тієї ж назви: функція `report_unknown_item(buyer_id text, text text)` (security definer) — вставляє або збільшує
`seen_count` і `last_seen`; сам рядок напряму гравець не оновлює. `grant execute` — лише `authenticated`.

## SQL-тест (`supabase/tests/buyer_unknown_items_test.sql`)

- `anon`: select / insert / виклик функції — заборонено;
- `user`: виклик функції — дозволено; select — 0 рядків; update/delete — заборонено;
- `admin`: select — бачить рядок; delete — дозволено;
- повторний виклик тієї ж пари → `seen_count = 2`, рядок один.

## Використання

- Програма: після розбору кадру — для рядків із ціною без упізнаної назви, якщо текст ≥ 4 літер; не частіше разу на
  годину на ту саму пару (у пам'яті); без інтернету — пропускається.
- Сайт: сторінка «Ціни», лише `admin` — список «Невідомі товари у скупників» (скупник, текст, скільки разів, коли),
  кнопка «Прибрати».
