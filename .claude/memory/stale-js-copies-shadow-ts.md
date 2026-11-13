---
name: stale-js-copies-shadow-ts
description: Забуті .js-копії від tsc у src/ підміняли .tsx у локальній збірці — після зміни інтерфейсу перевіряти, що новий код справді в бандлі
metadata:
  type: feedback
---

2026-11-10 (PR #125): у `src/` лежало 207 `.js`-копій від `tsc -b` (9 листопада, у `.gitignore`). Vite брав `Bar.js` замість `Bar.tsx`, тож локальна `npm.cmd start` показала власнику старий інтерфейс без розділу «Сповіщення», хоча `tsc`, тести й збірка були зелені. Власник написав «у мене немає сповіщення». На CI цього немає — там чистий checkout.

**Why:** помилка тиха: усе збирається, типи сходяться, тести проходять (vitest бере ті самі копії).

**How to apply:** у трьох конфігах Vite тепер `resolve.extensions` з `.ts/.tsx` перед `.js` — копії більше не підміняють. Але після зміни інтерфейсу однаково перевіряти бандл: `grep -c <новий клас> desktop/src/ui/assets/bar-*.js`. Копії прибирати: `git ls-files --others --ignored --exclude-standard -- 'src/**/*.js'` (видаляти лише ті, що мають `.ts`/`.tsx` поруч). У блочному коментарі не писати шлях із `**/` — він закриває коментар.

Живий інтерфейс без кліків власника: `electron . --remote-debugging-port=9333` і `Runtime.evaluate` / `Page.captureScreenshot` у сторінці `bar.html` через WebSocket Node. Після перевірки перезапустити без порту. Див. [[main-smoke-fake-electron]].
