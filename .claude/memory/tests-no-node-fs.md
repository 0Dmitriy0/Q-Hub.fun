---
name: tests-no-node-fs
description: Тести сайту (src/**/*.test.ts) не можуть імпортувати node:fs/node:path/__dirname — CI-збірка падає на tsc; читати файли через import.meta.glob ?raw
metadata:
  type: feedback
---

Тести сайту в `src/` не імпортують `node:fs`, `node:path` і не використовують `__dirname`. Файли читати через Vite: `import css from '../styles.css?raw'` або `import.meta.glob([...], { query: '?raw', import: 'default', eager: true })`.

**Why:** `npm run build` (і Desktop-збірка) запускає `tsc --noEmit` з `types: ["vite/client"]` — типів Node там немає, CI падає з TS2591. Локальний `npx.cmd tsc --noEmit -p .` цього НЕ ловить (2026-11-06, PR #106: локально чисто, на GitHub обидві збірки червоні).

**How to apply:** перед пушем тесту, що читає файли, перевірити, що в ньому немає `node:`-імпортів; локальному tsc у цьому питанні не вірити.
