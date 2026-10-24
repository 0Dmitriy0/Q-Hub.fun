# Contract: база (Supabase) — чернетки міток

Споживачі: програма (`insert`, Storage upload), сайт (select, RPC, Storage read/delete).
Схема — [data-model.md](../data-model.md).

## Програма → база

```text
storage.from('map-drafts').upload('<uid>/<id>.jpg', jpeg, { contentType: 'image/jpeg', upsert: false })
  ok | error "Duplicate"/409  → вважати успіхом (повтор відправки)
  error 403 / row-level security → відмова в правах (R7)

from('map_drafts').insert({ id, taken_at, shot: '<uid>/<id>.jpg', x?, y?, match })
  ok | error 23505 (unique_violation) → успіх (повтор)
  error 42501 / RLS → відмова в правах
```

`author` і `status` програма не передає (default `auth.uid()`, `'new'`).

## Сайт → база

```text
from('map_drafts').select('*, profiles!author(game_name)').order('created_at', desc)
  admin — усі; editor/moderator — свої; інші — порожньо

rpc('publish_map_draft', { draft uuid, category text, x float8, y float8, name text = '', note text = '' })
  → bigint  (id нової мітки в map_points)
  помилки (errcode P0001, message):
    'not_admin'          — викликав не admin
    'already_processed'  — status ≠ 'new'      → «Чернетку вже оброблено»
    'no_point'           — x або y null         → кнопка заблокована й так (сценарій 2.3)
    'no_category'        — category порожня     → «Оберіть категорію»
    check_violation      — точка поза мапою

rpc('reject_map_draft', { draft uuid }) → void
  помилки: 'not_admin', 'already_processed'

storage.from('map-drafts').createSignedUrl('<uid>/<id>.jpg', 600)   — admin або автор
storage.from('map-drafts').remove([...])                            — лише admin (R10)
from('map_drafts').update({ shot_deleted_at: now })                 — НЕ дозволено прямо;
rpc('mark_map_draft_shots_deleted', { drafts uuid[] }) → int        — admin; лише status ≠ 'new' і reviewed_at < now() − 30 днів
```

## Тести (`supabase/tests/map_drafts_test.sql`, принцип VI)

- anon і `user`: не бачать чернеток, не можуть `insert`, не читають бакет.
- `editor`: `insert` своєї — так; від чужого `author` — ні; зі `status = 'published'` — ні; бачить лише свої; RPC → `not_admin`.
- `moderator`: те саме, що `editor`.
- `admin`: бачить усі; `publish_map_draft` створює `map_points` і ставить `point_id`; повторний виклик → `already_processed`; `reject` після `publish` → `already_processed`.
- Повторний `insert` з тим самим `id` → `unique_violation`, рядок один.
- `x` без `y` → `check_violation`.
- `map_points` для `editor` і далі закриті (регресія `map_test.sql`).
