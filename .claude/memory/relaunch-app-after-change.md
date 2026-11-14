---
name: relaunch-app-after-change
description: Після кожної зміни коду програми — закрити Q-Hub власника й запустити свіжу збірку з коду, щоб він одразу тестував
metadata:
  type: feedback
---

Власник (2026-11-14): «запускай мені програму кожного разу, як ми щось міняємо в коді для тестування».

**Why:** власник тестує зміни сам у грі; встановлена `D:\Q-HUB\Q-Hub.exe` оновлюється лише з релізу пака, тож нових змін у ній немає.

**How to apply:**
- Коли: зміну закінчено й тести зелені (кінець задачі чи партії задач `/speckit-implement`, виправлення за відгуком). Не після кожного окремого Edit, бо половина зміни зламає запуск.
- Що вважається зміною: `desktop/`, `src/desktop/`, кабінет чи спільний код, що потрапляє в бандл програми. Зміни лише сайту чи специфікацій — без перезапуску.
- Кроки:
  1. Закрити все: `Get-Process Q-Hub -EA SilentlyContinue | Stop-Process -Force`, а також попередній запуск з коду: `Get-Process electron -EA SilentlyContinue | ? { $_.Path -like '*Q-Hub.fun*' } | Stop-Process -Force`.
  2. Зібрати: `npx.cmd vite build -c vite.app.config.ts` і `npx.cmd vite build -c vite.lib.config.ts` (повний `npm.cmd run build:app` ще й запускає `tsc`).
  3. Запустити у фоні (run_in_background): `cd desktop && npm.cmd start`.
  4. Перевірити, що піднялось (`Get-Process electron`), і коротко сказати власнику, що перевіряти.
- Запуск з коду живе, поки жива сесія Claude. Власнику нагадувати, що своя програма — `D:\Q-HUB\Q-Hub.exe`.
- Це скасовує заборону `npm start` з [[main-smoke-fake-electron]], коли запущена Q-Hub власника. Димову перевірку `main.cjs` можна робити й далі, але перед перезапуском, а не замість нього.
