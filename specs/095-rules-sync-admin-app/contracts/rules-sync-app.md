# Contract: POST /functions/v1/rules-sync, тіло від програми адміна

Доповнює `specs/010-rules-sources/contracts/rules-sync.md`. Без тіла (або з `{}`) функція поводиться як раніше: сама обходить форум.

## Запит

```
POST /functions/v1/rules-sync
Authorization: Bearer <сесія користувача з роллю admin>
Content-Type: application/json

{ "via": "app", "version": "0.9.12",
  "fresh":  [ { "title": "...", "section": "...", "url": "https://forum.quant5.com.ua/index.php?/topic/…", "kind": "rules", "src": 1, "items": [ { "n": "1.1", "h": "", "s": "..." } ] } ],
  "errors": [ [2, "форум не віддав сторінку (403) · index.php?/topic/…"] ],
  "titles": [ [1, "Правила серверу"] ] }
```

- `via: "app"` приймається лише з `Authorization` ролі admin. `x-sync-secret` з тілом `via: "app"` дає `403`: секрет GitHub не може підсунути теми.
- Функція **не** ходить на форум у цьому режимі.

## Відповіді

| Код | Коли | Тіло |
|---|---|---|
| 200 | прийнято (хоч одне джерело без помилки й знімок записано, або всі з помилкою, і тоді знімок не чіпаємо) | як зараз: `{ fetched, changes, changes_error, topics, items, sources: [...] }` + `last_ok: { at, via } \| null` |
| 400 | тіло не пройшло `guard.ts` | `{ error: "…зрозуміло, що не так…" }` |
| 403 | не admin, або секрет із `via: "app"` | `{ error: "Оновлювати правила може лише адміністратор." }` |
| 413 | тіло > 4 МБ | `{ error: "Завеликий знімок правил" }` |

Кожна відповідь, крім 403, пише рядок `rules_sync_runs`.

## Поведінка, спільна для обох режимів (зміна проти 010)

- Усі джерела з помилкою: `rules.json` **не** перезаписується, `ok = false`.
- Запобіжник «підозріло мало пунктів» (data-model.md).
- `last_ok` у відповіді є завжди.
