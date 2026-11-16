---
name: app-usage-measure
description: Як міряти процесор і пам'ять програми (specs/090) — usage.log, measure.ps1, режим заміру; пастка округлення в PowerShell
metadata:
  type: reference
---

Бюджет програми (specs/090, рішення власника 2026-11-16): пам'ять ≤ 1,5 ГБ, процесор від усього процесора — простій ≤ 1 %, фон під час гри ≤ 5 % (суворо), користування ≤ 10 %; для дій, які гравець запускає сам, швидкість важливіша за ліміт.

**Як міряти:**
- Програма сама пише `%APPDATA%\Q-Hub\usage.log` (рядки `MIN` щохвилини, `OVER`, `PRESSURE`). Перед паком — пошукати `OVER`.
- Режим заміру: запуск із `QHUB_USAGE_TRACE=1` (`cd desktop && QHUB_USAGE_TRACE=1 npx.cmd electron .`) — щосекундні `S`, тривалість дій `T`, лічильники «зору» `V` (скільки кадрів, скільки мс розпізнавання). Саме `V` показав, куди йде процесор.
- Зовні: `powershell -ExecutionPolicy Bypass -File desktop\scripts\measure.ps1 -Name electron -Minutes 10 -Label background` (`-ExecutionPolicy Bypass` обов'язково: скрипти на ПК вимкнено). Код виходу 1 — поза бюджетом.
- Сторож пам'яті на малих числах: `QHUB_MEM_SOFT=300 QHUB_MEM_HARD=400`.

**Пастки:**
- PowerShell: `[math]::Max(0, $x)` з цілим першим аргументом округлює `$x` до цілого — писати `0.0`. Через це перша версія скрипта занижувала процесор удвічі.
- `app.getAppMetrics().cpu.percentCPUUsage` — вже частка всього процесора, на кількість ядер не ділити.
- Простій знято 2026-11-16: 0,2 %, 456 МБ. Активне користування й 4-годинний сеанс не зняті — див. `specs/090-app-resource-limits/measurements.md`.

Пов'язане: [[relaunch-app-after-change]], [[powershell-utf8-mojibake]].
