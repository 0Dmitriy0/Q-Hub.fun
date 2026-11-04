# Контракт: функції бази для адмін-панелі (039)

Усі функції `admin_*`:
- `language plpgsql security definer set search_path = ''`;
- першим рядком перевіряють `if not public.is_admin() then raise exception 'потрібна роль admin' using errcode = '42501'`;
- `revoke all … from public, anon` і `grant execute … to authenticated`. Право перевіряє тіло функції, а не `grant`.

Коди помилок для інтерфейсу:
- `42501` — немає прав → «Немає прав — онови сторінку»;
- `P0002` — рядок уже розібрано → «Цей рядок уже розібрано», плюс перезавантаження черги;
- `22023` — невірні дані (текст помилки показується як є).

## Черги

| Функція | Аргументи | Повертає | Ефект |
|---|---|---|---|
| `admin_queue_counts()` | — | `json {unknown, limits, pending, drafts}` | лише читання |
| `admin_unknown_resolve(p_id bigint, p_action text, p_item bigint default null, p_name text default null, p_category text default null)` | `p_action ∈ {add, alias, drop}` | `void` | атомарно видаляє рядок черги. `add`: новий товар (`p_name`, `p_category`) або наявний `p_item` → `buyer_items(buyer_id, item_id)`, якщо ще немає. `alias`: `p_item` обов'язковий, текст рядка дописується в `items.aliases` |
| `admin_limit_resolve(p_buyer text, p_item bigint, p_action text, p_min bigint default null, p_max bigint default null)` | `p_action ∈ {fix, drop}` | `void` | атомарно видаляє рядок; `fix` — `0 < p_min < p_max` → `buyer_items` |
| `admin_price_pending()` | — | `setof (buyer_id, item_id, item, price, votes, need, last_at, reporters text[])` | лише читання |
| `admin_price_reject(p_buyer text, p_item bigint, p_price bigint)` | — | `int` (скільки голосів прибрано) | видаляє голоси за цю ціну, новіші за `price_at`; `0` → `P0002` |

«Підтвердити» непідтверджену ціну — звичайне внесення ціни з сайту (`price_reports`, `kind = 'buyer'`, `source = 'site'`). Окремої функції немає.

## Гравці й ролі

| Функція | Аргументи | Повертає |
|---|---|---|
| `admin_find_accounts(q text)` | `char_length(trim(q)) >= 2`, інакше `22023` | до 20 рядків: `id, nick, name, avatar_url, role, created_at, last_seen, version, characters json` |
| `admin_set_role(p_user uuid, p_role text)` | `p_role ∈ {user, editor, moderator, admin}` | `text` (нова роль) |

`admin_set_role` повертає `22023` у трьох випадках:
- «Свою роль admin зняти не можна»;
- «Це останній admin — спершу признач іншого»;
- «Немає такого акаунта».

## Стан програми

| Функція | Повертає |
|---|---|
| `app_ping(p_version text default null)` | `void`. Замінює `app_ping()`; старі програми кличуть без аргументу, і це працює |
| `admin_app_stats()` | `json`: `online_3m, online_24h, versions [{version, n}]` (7 днів, `version: null` = стара збірка), `ai {requests, users, capped, limit}` (сьогодні за Києвом), `downloads {n, since}` |

Остання версія в релізі береться не з бази, а з GitHub API `releases/tags/desktop-latest`: файл `Q-Hub-Setup-X.Y.Z.exe`.

## Знімки

| Функція | Аргументи | Повертає |
|---|---|---|
| `admin_training_shots(p_before timestamptz default null, p_limit int default 50)` | `p_limit` 1–100 | `name, created_at, owner uuid, nick` — лише `.jpg`, новіші першими |

Файли: `storage.from('training').createSignedUrls([...], 600)`, `.download(name.json)`, `.remove([jpg, json])`. Права — політики 0018 (`is_admin()`).

## Програма → база

`desktop/src/main.cjs`:
- `sb.rpc('app_ping', { p_version: app.getVersion() })`;
- вибірка `items(name, aliases)` для зіставлення назв.
