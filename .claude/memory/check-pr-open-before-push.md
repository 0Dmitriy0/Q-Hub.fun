---
name: check-pr-open-before-push
description: Перед git push у гілку PR перевірити, що PR ще відкритий — коміт у злиту гілку в main не потрапить
metadata:
  type: feedback
---

2026-11-05: виправлення «без рядка над карткою» (b28d1ce) пішло в гілку 060-discord-news уже після злиття PR #91 — у main його не було, функцію бота задеплоїли з main, і дубль заголовка повернувся в Discord.

**Why:** власник зливає PR сам і швидко; злита гілка мовчки приймає push.

**How to apply:** перед push у наявну гілку — `gh pr view <гілка> --json state`; якщо MERGED — нова гілка від свіжого main і cherry-pick. Функцію `discord-bot` деплоїти лише з коду, що є (або от-от буде) в main. Див. [[discord-bot-ops]].

2026-11-10: повторилось з PR #125 — `gh pr view 125 --json state -q .state && git push` не захищає: команда друкує MERGED і завершується успішно, тож push іде далі. Перевіряти так: `[ "$(gh pr view N --json state -q .state)" = OPEN ] && git push`.
