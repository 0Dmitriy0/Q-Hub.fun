# Контракт бази: нік, персонажі, ціни

Права перевіряє SQL-тест `supabase/tests/account_nick_test.sql` (рядок у `supabase/tests/run.sh`).

## Запис

| Дія | Хто | Що база робить |
|---|---|---|
| `update profiles set nick = …` | власник | формат, унікальність без регістру, раз на 30 днів (перший вибір — без обмеження; `admin` — без обмеження) |
| `update profiles set game_name/static_id` | власник | дозволено, як і раніше (старі клієнти), але ніде не читається |
| `insert characters (name, static_id, start_balance)` | власник | формат імені, статік унікальний, ≤ 3 на акаунт |
| `update characters set name/static_id` | власник | ті самі перевірки; чужий — RLS не дасть |
| `delete characters` | власник | ціни лишаються (`character_id` → null) |
| `insert price_reports (…, character_id)` | гравець | нік + свій персонаж зі статіком; без `character_id` — лише якщо персонаж один |

Тексти відмов (українською, як бачить гравець):

- `Нік «…» уже зайнятий.`
- `Нік можна змінити знову з DD.MM.YYYY.`
- `Статік … уже має інший персонаж.`
- `В акаунті вже 3 персонажі.`
- `Спершу вибери нік акаунта.` / `Спершу додай персонажа.` / `Обери персонажа, з якого вписуєш ціну.`

## Читання (anon і authenticated)

```text
price_updates(id, buyer_id, item_id, price, created_at, cycle, reporter_id, reporter_name, reporter_character)
contributors(id, name, avatar_url, week, month, year, total, last_at)
buyer_next_change(buyer_id, next_change_at, nick)
map_owners(static_id, game_name)        -- з characters, лише статіки, що стоять на мітках
```

Статік автора ціни й персонажа в публічних зведеннях **відсутній** (SC-003).

## Тест має перевірити

- anon: не читає `characters`, не пише `profiles.nick`, не вставляє ціни;
- `user`: свій нік — так, чужий — ні; зайнятий нік (інший регістр) — відмова; друга зміна за 30 днів — відмова;
- `user`: 4-й персонаж — відмова; зайнятий статік — відмова; ім'я `saha_23` — відмова;
- `user`: ціна з чужим `character_id` — відмова; без `character_id` при двох персонажах — відмова; при одному — підставлено;
- `user` без ніка — ціна не приймається;
- видалення персонажа — ціна лишилась, `character_id` null;
- у `price_updates` і `contributors` немає стовпців зі статіком.
