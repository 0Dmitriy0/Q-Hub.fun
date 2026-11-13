---
name: map-batch-restore-seed
description: Відкат партії міток мапи видаляє мітки назавжди — гарбузи відновлюються з supabase/seed/map_pumpkins_ohm.sql
metadata:
  type: project
---

«Відкат» партії в адмінці мапи = `delete from map_batches` (мітки йдуть каскадом), кнопки «повернути» немає. 2026-11-14 власник випадково відкотив гарбузи; відновили сідом `supabase/seed/map_pumpkins_ohm.sql` (790 міток) через SQL Editor.

**Why:** оригінальний сід робить `delete ... where source = 'ohm'` — прибрав би й інші партії Open Hydra Map.

**How to apply:** для відновлення давати копію сіду з `and category_id = 'harbuzy'` у delete і `published = true` (якщо вже перевіряли в грі); SQL — у буфер обміну (див. [[discord-bot-ops]]).
