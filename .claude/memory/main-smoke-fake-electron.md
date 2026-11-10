---
name: main-smoke-fake-electron
description: Склейку desktop/src/main.cjs перевіряти димовим запуском з підробленим electron — npm start не можна, коли Q-Hub власника запущена
metadata:
  type: feedback
---

Коли на ПК власника запущена встановлена Q-Hub (`tasklist | grep Q-Hub.exe`), `cd desktop && npm.cmd start` для перевірки не запускати: та сама тека `userData` і блокування другої копії, а з окремою текою — вікно «Alt+Q уже зайнята» на його екрані.

**Why:** 2026-11-10 (specs/075–077) програма власника працювала; при цьому `main.cjs` не має тестів на склейку, і помилку в назві змінної видно лише при запуску.

**How to apply:** димовий скрипт у scratchpad: `Module._load` підміняє `electron` (Proxy-заглушка на все; справжні лише `app.whenReady/getPath` у тимчасову теку, `ipcMain.handle` — збирає обробники, `Notification` — записує показане, `dialog.showErrorBox` — збирає помилки), далі `require('desktop/src/main.cjs')`, виклик обробників з `e = { sender: заглушка }` і читання `settings.json`. Перед цим — `npm.cmd run build:app` (потрібні `desktop/src/lib/*.cjs`). Інтерфейс плашки так не перевірити — це в чекліст власнику. Варіант зробити з цього постійний тест — у `docs/PLAN.md` (аудит 2026-11-10).

Окремо: у Bash цього середовища heredoc з апострофом у тексті («комп'ютер») падає з `unexpected EOF` — файли з українським текстом писати через Write/Edit. Див. [[powershell-utf8-mojibake]], [[node-heredoc-backslash]].
