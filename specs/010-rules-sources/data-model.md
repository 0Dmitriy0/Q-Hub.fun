# Data Model: Усі правила й закони QuantRP

## rule_sources (Supabase, RLS — лише admin)

| Поле | Тип | Правила |
|---|---|---|
| id | bigint identity | |
| url | text, unique | лише `https://forum.quant5.com.ua/index.php?/forum/…` або `…/topic/…` (check у базі, FR-011) |
| kind | text | `rules` (правила сервера) / `law` (закон штату) / `order` (наказ організації) |
| enabled | boolean, default true | вимкнена тема в увімкненому розділі — тема не береться (FR-010) |
| title | text, null | назва розділу чи теми з останнього оновлення |
| items | int, default 0 | пунктів з останнього вдалого оновлення |
| synced_at | timestamptz, null | останнє вдале оновлення |
| error | text, null | остання помилка («форум недоступний», «0 пунктів — розмітка змінилась?») |
| diff | jsonb, null | `{ added, changed, removed }` останнього оновлення |
| created_by | uuid → profiles, default auth.uid() | |
| created_at | timestamptz, default now() | |

- За замовчуванням (міграція): `forum/10-правила-серверу` (`rules`), `forum/36-законодавча-база-штату` (`law`).
- Тема всередині розділу з `enabled = false` — виключення: розділ її пропускає.
- Дубль (тема, яка вже є в розділі, додана окремо) — пункти не дублюються: тема береться один раз, тип — від окремого
  джерела теми.

## Знімок правил (бакет `rules`, `rules.json`) — contracts/rules-snapshot.md

`{ fetched: ISO, topics: Topic[] }`; `Topic = { title, section, url, kind, items: Item[] }`; `Item = { n, h, s }`
(як зараз + `kind`).

## Кеш програми

`%APPDATA%\Q-Hub\rules.json` + `rules.json.etag`; порядок: свіжий зі сховища → кеш → вбудована копія.
