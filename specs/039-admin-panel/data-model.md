# Data Model: Адмін-панель (039)

Нових таблиць немає. Зміни та сутності, з якими працює панель.

## Зміни схеми (`0046_admin_panel.sql`)

| Таблиця | Зміна | Правила |
|---|---|---|
| `app_presence` | `+ version text` | `null` або `^\d+\.\d+\.\d+$`; пише лише `app_ping` у свій рядок |
| `app_presence` | `+ first_seen timestamptz default now()` | для «з якого часу в програмі»; не обов'язкове |
| `items` | `aliases text[]` (вже є) | дописує лише `admin_unknown_resolve('alias')`, без дублів, кожен 4–80 символів |

## Сутності панелі

**Рядок невідомого товару** — `buyer_unknown_items`: `id, buyer_id, text, seen_count, last_seen, reported_by`.
- Після будь-якої дії рядок видаляється, тобто стан лише «є в черзі» або «розібрано».
- Сортування: `seen_count desc, last_seen desc`.

**Рядок «ціна поза межами»** — `buyer_limit_reports`: `(buyer_id, item_id), price, seen_count, last_seen` плюс поточні `buyer_items.min_price/max_price` та `items.name`.
- `fix` вимагає `0 < min < max` і видаляє рядок.

**Непідтверджена ціна** — `admin_price_pending()`: `buyer_id, item_id, item, price, votes, need, last_at, reporters[] (нік)`.
- «Підтвердити» — внесення адміна з сайту, ціна стає поточною (0043).
- «Відкинути» — видаляє голоси за `price` після `price_at`.

**Акаунт** — `admin_find_accounts(q)`: `id, nick, name, avatar_url, role, created_at, last_seen, version, characters: [{name, static_id}]`.
- Роль: `user | editor | moderator | admin`.
- Переходи ролі — будь-які, крім:
  - зняття `admin` із себе;
  - зняття з останнього `admin`.

**Стан програми** — `admin_app_stats()`: `online_3m, online_24h, versions [{version|null, n}], ai {requests, users, capped, limit}, downloads {n, since}`.

**Навчальний знімок** — `admin_training_shots(before, limit)`: `name, created_at, owner, nick`, плюс з `.json` поруч: `label, note, version, size`.
- Похідне поле `old = created_at < now() - 90 днів`.

**Налаштування сайту** — `site_links.discord_url`, `site_promo (code, reward, note, enabled)`. Без змін, наявні політики admin.
