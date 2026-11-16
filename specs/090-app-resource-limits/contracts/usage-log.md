# Contract: журнал споживання й інструменти заміру

Зовнішніх інтерфейсів (API, база, IPC з вікнами) функція не додає. Контракт — це формат файла, який читає власник, і команди заміру.

## 1. Файл `usage.log`

- **Де**: тека даних програми (`userData`), поруч із `vision.log`; зазвичай `%APPDATA%\Q-Hub\`.
- **Кодування**: UTF-8, один запис — один рядок, поля через пробіл, `ключ=значення`.
- **Розмір**: понад 2 МБ — лишається хвіст 200 КБ (обрізання під час запуску й раз на добу).
- **Нікуди не відправляється** (FR-012); знімків екрана, ніків і цін не містить.

### Хвилинний запис

```text
2026-11-16T18:42:00.000Z MIN state=background cpu=3.1 cpuMax=7.4 mem=612 ws=840 procs=7
```

| Поле | Одиниця | Опис |
|------|---------|------|
| `state` | — | `idle` / `background` / `active` |
| `cpu` | % усього процесора | середнє за хвилину |
| `cpuMax` | % | найбільший замір за хвилину |
| `mem` | МБ | найбільша приватна пам'ять усіх процесів програми |
| `ws` | МБ | найбільший робочий набір |
| `procs` | — | кількість процесів |

### Перевищення

```text
2026-11-16T18:47:12.000Z OVER kind=cpu-background value=6.8 limit=5 window=10m
2026-11-16T19:03:40.000Z OVER kind=mem value=1532 limit=1500
```

`kind`: `mem`, `cpu-idle`, `cpu-background`, `cpu-active`, `spike`.

### Тиск пам'яті

```text
2026-11-16T19:03:41.000Z PRESSURE level=soft before=1214 after=905 did=lists,map,locator
```

`level`: `soft` / `hard` / `ok`; `did` — що звільнено: `lists`, `ocr`, `map`, `timer`, `rule`, `locator`, `grab`.

### Запуск

```text
2026-11-16T18:00:03.000Z START v=0.9.4 cores=12 ram=16
```

### Режим заміру

`QHUB_USAGE_TRACE=1` — додатково кожну секунду:

```text
2026-11-16T18:42:07.000Z S state=active cpu=11.9 mem=701
```

і тривалість дій гравця (для SC-007):

```text
2026-11-16T18:42:09.000Z T kind=buyer-frame ms=497
```

`kind`: `buyer-frame` (кадр списку скупника), `locate` (пошук місця на мапі), `bar-show`, `map-show` (від клавіші до показу вікна).

## 2. Змінні середовища (лише для перевірки)

| Змінна | Дія |
|--------|-----|
| `QHUB_USAGE_TRACE=1` | секундні записи `S`; вмикає перевірку `spike` |
| `QHUB_MEM_SOFT`, `QHUB_MEM_HARD` | пороги сторожа в МБ — щоб викликати спрацювання на малих числах |
| `QHUB_IDLE_MS` | уже є: час до закриття схованих вікон |

У гравців жодна з них не задана.

## 3. Скрипт заміру `desktop/scripts/measure.ps1`

```text
powershell -ExecutionPolicy Bypass -File desktop\scripts\measure.ps1 -Name electron -Minutes 10 -Label background
```

| Параметр | Опис |
|----------|------|
| `-Name` | назва процесу: `electron` (запуск з коду) або `Q-Hub` (встановлена) |
| `-PathMatch` | частина шляху до exe, щоб не рахувати інші програми на Electron; для `electron` типово `Q-Hub.fun` |
| `-Minutes` | тривалість |
| `-Label` | стан сценарію: `idle`, `background`, `active`, `soak` |
| `-Out` | тека для CSV; типово `specs\090-app-resource-limits\runs` (не в git) |

**Вивід**: CSV `time;cpu;mem;ws;procs` (раз на секунду) і підсумок у консолі:

```text
background 10 min: cpu avg 3.4 % max 9.1 %; longest above 10 %: 0 s; samples above 25 %: 0; mem max 640 MB (working set 810 MB)
```

Код виходу 0 — стан у межах бюджету, 1 — ні, 2 — програму не знайдено. Текст англійською: PowerShell 5.1 читає скрипт без BOM як ANSI, і кирилиця в ньому ламається.

Короткі дочірні процеси (`tasklist` раз на 10 с) скрипт не бачить — вони живуть частки секунди; їхню вагу оцінюємо окремо (research.md, H4).

## 4. Модуль `desktop/src/usage.cjs` (чиста логіка, тести `usage.test.cjs`)

| Функція | Вхід → вихід |
|---------|--------------|
| `sample(metrics, state, now)` | знімок `getAppMetrics()` → `Sample` |
| `createMeter(budget)` | `.feed(sample)` → `{ minute?, over[] }` — згортка за хвилину й перевищення |
| `createGuard(budget)` | `.feed(mem, now)` → `{ level, changed, actions[] }` — сторож пам'яті з гістерезисом і паузою 2 хв |
| `line(record)` | запис → рядок журналу |
| `stateOf({ session, windowShown, listsAt, now })` | стан `idle` / `background` / `active` |

Electron у модуль не імпортується — як у `idlewin.cjs` та `ocridle.cjs`.
