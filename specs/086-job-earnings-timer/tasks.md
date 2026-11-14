---
description: "Task list: Таймер заробітку на роботі"
---

# Tasks: Таймер заробітку на роботі

**Input**: `specs/086-job-earnings-timer/` — plan.md, spec.md, research.md, data-model.md, contracts/timer-ipc.md, contracts/wage-proposal.md, quickstart.md

**Tests**: так — конституція, принцип VI: чиста логіка програми MUST мати модульні тести `node --test` (`desktop/src/*.test.cjs`, запуск `cd desktop && npm.cmd test`). SQL-тестів не треба: правила доступу не змінюються (plan.md, Constitution Check).

**Organization**: за історіями зі spec.md — US1 (P1), US2 (P1), US3 (P2), US4 (P3).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Переконатися, що `cd desktop && npm.cmd test` і `npm.cmd test` у корені зелені до змін (база); перевірити, що Q-Hub власника закрита перед кожним запуском з коду (пам'ять «Перезапуск програми після зміни»)
- [X] T002 [P] Нова точка входу Vite: `timer.html` у корені (за зразком `rule.html`: `<div id="root">`, `<script type="module" src="/src/desktop/timerMain.tsx">`) і `timer: 'timer.html'` у `rollupOptions.input` в `vite.app.config.ts:16`

---

## Phase 2: Foundational (блокує всі історії)

**Мета**: чистий модуль виміру з тестами, вікно таймера, гаряча клавіша, IPC — каркас, на який лягають US1–US4.

- [X] T003 Написати тести `desktop/src/jobtimer.test.cjs` (спершу червоні, `node:test` + `assert`) для ядра з data-model.md: `create(char, now)` → `state 'wait'`; перший `update(money, at)` → `state 'run'`, `last` = готівка + картка, `gain 0`; зростання додаються в `gain`; «зменшення балансу … не враховуються» (gain не падає); `|d| > max_jump` → `flag = true`, у gain не йде; `perHour` = `null` при `runMs < 60 000`, інакше `round(gain / (runMs / 3 600 000))` (перевірити 20 хв +12 000 $ → 36 000); `stop()` → `state 'done'`, `runMs` зафіксовано; `runMs` рахується з `runFrom` у `run`; `state()`/`restore(saved)` — серіалізація; `restore` виміру в `run` → `state 'pause'`, `interrupted = true`
- [X] T004 Створити `desktop/src/jobtimer.cjs` (CommonJS, без Electron; коментарі українською, як `sessionmoney.cjs`): `create`, `update(money, at, maxJump)`, `tick(now)` (оновлює `runMs` для показу), `stop(now)`, `state()`, `restore(saved, now)`, `perHour(m)`, константи `MIN_MS = 60e3`; `module.exports`; довести T003 до зеленого
- [X] T005 Вікно таймера в `desktop/src/main.cjs` за зразком `createRuleWin` (`main.cjs:280`): `createTimerWin()` — прозоре, без рамки, `alwaysOnTop('screen-saver')`, `skipTaskbar`, `resizable: false`, preload `preload.cjs`, `loadFile(ui/timer.html)`; `timerLock(locked)` як `ruleLock` (`main.cjs:322`): `setIgnoreMouseEvents(locked)`, `setFocusable(!locked)`, `setMovable(!locked)`; викликати `timerLock` там само, де `ruleLock` (показ/ховання плашки); місце — `settings.timerWin` з перевіркою, що точку видно на моніторі (як місце вікна правил), типово — праворуч зверху
- [X] T006 Гаряча клавіша в `desktop/src/main.cjs`: `timerKey: 'Alt+T'` у `BAR_DEFAULTS` (`main.cjs:582`); `registerTimerKey(key)` як `registerMapKey` (`main.cjs:269`); виклик поруч з `registerMapKey(p.mapKey)` (`main.cjs:976`); у збереженні налаштувань — гілка `p.timerKey` як для `mapKey` (`main.cjs:1001`): конфлікт з `hotkey`, `mapKey`, `pinKey`, `SHOT_KEY` → помилка «… уже зайнята», не вдалося зареєструвати → повернути стару й помилку
- [X] T007 IPC-каркас (contracts/timer-ipc.md) у `desktop/src/main.cjs`: `const fromTimer = e => timerw && e.sender === timerw.webContents`; `timerView()` → `TimerView` (поля з контракту); `timerPush()` → `timerw.webContents.send('timer-view', timerView())`; канали `timer-state`, `timer-cmd`; `timer-toggle` (лише `fromBar`); інтервал 1 с, коли `state === 'run'`, шле `timer-view` без запису на диск
- [X] T008 [P] `desktop/src/preload.cjs`: `timerState`, `timerCmd(cmd)`, `timerJobs`, `timerLabel(arg)`, `timerHistory`, `timerDelete(id)`, `timerPropose(id)`, `timerToggle`, `onTimerView(cb)` — як `ruleOpen`/`ruleState` (`preload.cjs:44`)
- [X] T009 [P] `src/desktop/timerMain.tsx` (за зразком `src/desktop/ruleMain.tsx`): монтує `<Timer />`, підключає `bar.css`; тип API `TimerApi` з методами T008

**Checkpoint**: `jobtimer.test.cjs` зелений; Alt+T показує порожнє вікно таймера, кліки проходять у гру, поки Alt+Q закрита.

---

## Phase 3: User Story 1 — Заміряти заробіток на роботі (P1) 🎯 MVP

**Goal**: Alt+T → відлік; час, зароблено, $/год; Alt+T ще раз → підсумок; ще раз → закрити.

**Independent Test**: старт → +12 000 $ за 20 хв → стоп → 20 хв, +12 000 $, ≈36 000 $/год (quickstart §2 кроки 1–2, 4).

- [X] T010 [US1] `timerPressed()` у `desktop/src/main.cjs` (FR-003, contracts/timer-ipc.md «Гаряча клавіша»): немає виміру → `jobtimer.create(moneyKey(), Date.now())`, показати вікно (`showInactive`), `timerPush()`; `wait/run/pause` → `stop`, зберегти; `done` → вимір у історію (T020 поки — просто тримати), сховати вікно
- [X] T011 [US1] Підключити баланс: у `onMoney(m, at)` (`desktop/src/main.cjs:385`) після сеансу — якщо є вимір, `jobtimer.update(m, at, Number(moneyRules().max_jump) || MAX_JUMP)` і `timerPush()`; зміна `moneyKey()` (інший персонаж чи сесія) під час `run/pause` → автостоп (Edge Case)
- [X] T012 [US1] Збереження стану: `settings.jobTimer = jobtimer.state()` + `saveSettings()` при старті, паузі, стопі й не частіше разу на 30 с у `run` (research.md R6); при запуску програми — `jobtimer.restore(settings.jobTimer)` і показ вікна, якщо вимір не `done` (FR-011)
- [X] T013 [US1] `src/desktop/Timer.tsx` — стан `wait`: «Чекаю баланс…» з підказкою «відкрий гру — баланс видно в куті екрана»; `run`: великий час `ГГ:ХХ:СС`, рядки «Зароблено +12 000 $» і «За годину ≈36 000 $» (`money()` з `src/lib/format`), до 1 хв — «за годину — замало часу» (FR-005); `done`: підсумок (тривалість, зароблено, $/год); кнопки «Стоп» і «Закрити», активні лише при `view.free`; підказка «Alt+T — стоп» внизу
- [X] T014 [US1] Кнопка в плашці: значок `Icon name="clock"` (чи наявний схожий) у панелі значків `src/desktop/Bar.tsx` поруч з «Історією» (~`Bar.tsx:264`), `title="Таймер заробітку (Alt+T)"`, `onClick={() => api.timerToggle()}` (FR-002); метод `timerToggle` у типі `BarApi`
- [X] T015 [US1] Стилі вікна таймера в `src/desktop/bar.css`: `.twin` — фон і рамка як `.rwin` (`bar.css:388`), ширина ~260px; час — `font: 700 26px var(--mono)`; «Зароблено» — `--good`; «за годину» — `--fg`; `.twin.free` — помаранчева рамка як `.rwin.free`; кнопки — `.bcopy`

**Checkpoint**: US1 працює — MVP можна перевірити в грі.

---

## Phase 4: User Story 2 — Пауза й чесний підрахунок (P1)

**Goal**: пауза не рахує час і гроші; витрати не віднімаються; стрибки позначаються; час без балансу видно.

**Independent Test**: старт → +5 000 $ за 10 хв → пауза 5 хв (покупка 2 000 $) → продовжити → +5 000 $ за 10 хв → стоп: 20 хв, +10 000 $, 30 000 $/год (quickstart §2 крок 3).

- [X] T016 [US2] Тести в `desktop/src/jobtimer.test.cjs`: `pause(now)` → `state 'pause'`, `runMs` += відрізок, `runFrom = null`; зчитування в паузі не змінюють `gain` (зокрема зростання й спад); `resume(now)` → `last` := останній баланс, побачений у паузі, `runFrom = now`; сценарій з Independent Test дає 20 хв / 10 000 / 30 000; `blindMs`: у `run` проміжок між зчитуваннями > 15 000 мс додає `(проміжок − 15 000)` до `blindMs`; `blind(now)` true, коли від `lastAt` > 15 с
- [X] T017 [US2] Реалізувати `pause`, `resume`, облік `blindMs` і `blind(now)` у `desktop/src/jobtimer.cjs` (data-model.md «Переходи стану», research.md R3); довести T016 до зеленого
- [X] T018 [US2] `timer-cmd` `'pause' | 'resume'` у `desktop/src/main.cjs` + збереження стану (T012); `TimerView.flag`, `blind`, `blindMs`, `interrupted`
- [X] T019 [US2] `src/desktop/Timer.tsx`: кнопка «Пауза/Продовжити»; у паузі час сірий з «пауза»; «баланс не видно» (жовта примітка), коли `view.blind`; у підсумку — «Був сумнівний стрибок балансу — він не врахований» при `flag` і «баланс не видно N хв» при `blindMs ≥ 60 000`; `interrupted` → «Вимір перервано (програму закрили) — продовж чи зупини»

**Checkpoint**: US1 + US2 — точний вимір.

---

## Phase 5: User Story 3 — Підпис: робота з рівнем або власний замір; історія (P2)

**Goal**: після стопу — «робота + рівень» / «власний замір» / «без підпису»; історія з середніми по групах; підстановка останнього підпису.

**Independent Test**: «Ферма · рівень 3» ×2 (30 000, 34 000) і «Ферма · рівень 1» (18 000) → групи 32 000 і 18 000 окремо; «риболовля на пірсі» — окремо (quickstart §2 крок 5, §4 кроки 1–4).

- [X] T020 [US3] Тести в `desktop/src/jobtimer.test.cjs`: `cleanLabel(x)` за data-model.md — `{ kind: 'job', id, name, level }`: «`job.level` — ціле `1…100` або `null`; інше значення поле не приймає» (0, 101, 2.5, '3', NaN → помилка); `{ kind: 'own', name }`: «`trim()`, `1…60` знаків; порожня — не зберігається як власний; довша — обрізається до 60»; `null` — без підпису; `groupKey(label)` — `job:<id>:<level ?? '-'>`, `own:<name.trim().toLowerCase()>`, `none`; `history.add(m)` — новіші першими, «не більше 200 (старіші відкидаються)»; `history.groups(items)` — «`Σgain ÷ Σ(runMs / 3 600 000)`, лише виміри з `runMs ≥ 60 000` і без `flag`», заголовки «Ферма · рівень 3», «Ферма · рівень не вказано», назва власного, «Без підпису»; `history.relabel(items, id, label)` — відмова, якщо вимір `sent`; `history.remove(items, id)`
- [X] T021 [US3] Реалізувати `cleanLabel`, `groupKey`, `groupTitle`, `history` (`add`, `groups`, `relabel`, `remove`) у `desktop/src/jobtimer.cjs`; довести T020 до зеленого
- [X] T022 [US3] Історія на диску в `desktop/src/main.cjs`: `jobtimer.json` у `dir()` (як `history.json`, `main.cjs:176`), читання/запис з try/catch; у `timerPressed()` на `done` → `history.add`, `settings.jobTimer = null`; `settings.jobTimerLast[char]` = підпис останнього підписаного виміру (FR-010a) → `TimerView.suggest`
- [X] T023 [US3] IPC у `desktop/src/main.cjs` (contracts/timer-ipc.md): `timer-jobs` — `sb.from('jobs').select('id,name').eq('hidden', false).order('name')`, кеш у `settings.jobsCache`, без зв'язку — кеш (research.md R8); `timer-label` — `cleanLabel`, для поточного виміру чи `id` з історії, помилка — `{ ok: false, error: 'Рівень — ціле число від 1 до 100' }` / «Напиши назву заміру»; `timer-history` — `{ items, groups }`; `timer-delete`
- [X] T024 [US3] `src/desktop/Timer.tsx` — підсумок: перемикач «Робота · Власний замір · Без підпису»; «Робота» — пошук-список робіт (`timerJobs`) і поле «Рівень навички» (`inputMode="numeric"`, 1–100, підпис під полем «необов'язково; для довідника — потрібно»); «Власний замір» — поле назви (`maxLength=60`); наперед — `view.suggest`; кнопка «Зберегти»; помилки — під полем (skill forms: blur-first, видима мітка)
- [X] T025 [US3] `src/desktop/Timer.tsx` — вкладка «Історія»: групи (назва, N вимірів, час, $/год) і список вимірів (дата, підпис, тривалість, зароблено, $/год, «сумнівний»); дії «Змінити підпис» (не для надісланих) і «Видалити» з підтвердженням; порожній стан «Ще немає вимірів — Alt+T на роботі»; стилі в `src/desktop/bar.css`

**Checkpoint**: US1–US3 — особистий інструмент повністю.

---

## Phase 6: User Story 4 — Запропонувати заробіток у довідник (P3)

**Goal**: вимір «робота + рівень», ≥ 10 хв, без стрибків → пропозиція в чергу модерації; текст заробітку зводиться з поточним по рівнях.

**Independent Test**: «Ферма · рівень 3», 30 хв, +15 000 $ → «Запропонувати» → у черзі адмінки diff `Заробіток` дописує `Рівень 3: ≈30 000 $/год (…)`, рівень 1 лишився → опублікувати → у довіднику видно (quickstart §3, §4 кроки 5–6).

- [X] T026 [US4] Тести в `desktop/src/jobtimer.test.cjs`: `canPropose(m, ctx)` — причини за порядком «`sent` / `no-label` / `own` / `no-level` / `gone` / `short` / `flag` / `login` / `offline`», поріг `runMs ≥ 600 000`; `payPart(m)` → `Рівень 3: ≈30 000 $/год (вимір 30 хв, 14.11.2026)` (округлення до сотні вниз від 10 000, research.md R9; дата за Києвом); `mergePay(cur, level, part)` за contracts/wage-proposal.md — заміна частини того самого рівня, дописування нового з сортуванням рівнів за N, частини без «Рівень …» лишаються на початку, розділювач « · », результат > 300 → лише `part` і ознака `tooLong`; `sourceNote(m, tooLong)` ≤ 300 знаків, містить рівень, хвилини, `+gain $`, `$/год`, сумнівність, «баланс не видно N хв», `id:<m.id>`
- [X] T027 [US4] Реалізувати `canPropose`, `payPart`, `mergePay`, `sourceNote` у `desktop/src/jobtimer.cjs`; довести T026 до зеленого
- [X] T028 [US4] `timer-propose` у `desktop/src/main.cjs` (contracts/wage-proposal.md): `canPropose` (з `login` — є сесія `sb.auth.getSession()`, `gone` — робота є в `jobsCache`); прочитати свіжий `jobs.pay` (`select('pay').eq('id', label.id).maybeSingle()`); `insert({ section: 'job', target_id, kind: 'edit', data: { pay }, source: 'game', source_note }).select('id').single()`; успіх → `m.sent = { at, proposalId }`, зберегти історію; помилка — текст бази як є (QH001/QH002/QH014), мережа — «Немає зв'язку — спробуй пізніше» (вимір лишається, FR-018)
- [X] T029 [US4] Статуси в `timer-history` (`desktop/src/main.cjs`): для вимірів з `sent.proposalId` без кінцевого статусу — `sb.from('wiki_proposals').select('id,status').in('id', ids)` → `sent.status` (FR-017); без зв'язку — як є
- [X] T030 [US4] `src/desktop/Timer.tsx`: у підсумку й в історії кнопка «Запропонувати в довідник» (активна при `canPropose`), інакше — причина текстом: «Обери роботу з довідника» / «Власний замір у довідник не йде» / «Впиши рівень навички» / «Цієї роботи вже немає в довіднику» / «Заміряй щонайменше 10 хв» / «Був сумнівний стрибок балансу» / «Увійди через Discord у програмі» / «Немає зв'язку»; після надсилання — «Надіслано на перевірку», в історії мітки «на перевірці / опубліковано / відхилено»

**Checkpoint**: усі чотири історії працюють.

---

## Phase 7: Polish & Cross-Cutting

- [X] T031 [P] Налаштування: рядок «Таймер заробітку» з `KeyRec` для `prefs.timerKey` (типово `Alt+T`, кнопка «скинути») у `src/desktop/Settings.tsx` поруч з рядком мапи (`Settings.tsx:107`); тип `prefs.timerKey`
- [X] T032 [P] `src/lib/hotkeys.ts`: у групу «У грі» — `{ key: 'Alt+T', pref: 'timerKey', t: 'Таймер заробітку', d: 'Заміряти заробіток на роботі: натисни — старт, ще раз — підсумок' }`
- [X] T033 [P] Режим стрімера (FR-013): у `TimerView.streamer` вікно не показує нік/персонажа (перевірити, що `Timer.tsx` їх і не показує); підказка в `AppGuide`/довідці плашки, якщо там є перелік клавіш
- [X] T034 [P] Рядок у верхній `pending`-пак `src/data/changelog.json`, група `added`, мовою гравця: «Таймер заробітку (Alt+T чи кнопка в плашці): заміряй, скільки платить робота за годину — з паузою, рівнем навички чи власною назвою заміру; вимір можна запропонувати в довідник робіт»
- [X] T035 Повний прогін: `cd desktop && npm.cmd test`, `npm.cmd test`, `npx.cmd tsc --noEmit`; виправити червоне
- [X] T036 Зібрати й перезапустити програму з коду (`npx.cmd vite build -c vite.app.config.ts`, `npx.cmd vite build -c vite.lib.config.ts`, `cd desktop && npm.cmd start`); перевірити в бандлі `grep -c twin desktop/src/ui/assets/*.css`; пройти quickstart.md §2 і §4 (з портом налагодження 9333 і знімками, як у specs/085), потім перезапустити без порту
- [X] T037 Пройти quickstart.md §3 (US4) — лише з погодження власника: пропозиція реально потрапить у чергу модерації; після перевірки відхилити тестову пропозицію в адмінці з причиною «тест таймера»

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** → історії.
- **Phase 2 (T003–T009)** блокує все: модуль і вікно.
- **US1 (T010–T015)** — MVP; **US2 (T016–T019)** спирається на US1 (той самий вимір і вікно).
- **US3 (T020–T025)** — після US1 (потрібен `done`); незалежна від US2.
- **US4 (T026–T030)** — після US3 (потрібні підпис з рівнем і історія).
- Тести перед реалізацією: T003→T004, T016→T017, T020→T021, T026→T027.
- `desktop/src/main.cjs` правлять T005–T007, T010–T012, T018, T022–T023, T028–T029 — послідовно; `Timer.tsx` — T013, T019, T024–T025, T030 — послідовно.

## Parallel Opportunities

- T002 ∥ T003 (різні файли); T008 ∥ T009 після T007.
- Тести історій (T016, T020, T026) можна писати наперед паралельно з UI-задачами іншої історії — але один файл `jobtimer.test.cjs`, тож по черзі між собою.
- Polish: T031 ∥ T032 ∥ T033 ∥ T034.

### Приклад для US1

```text
T010 timerPressed (main.cjs) → T011 onMoney → T012 збереження
паралельно: T013 Timer.tsx, T014 Bar.tsx, T015 bar.css
```

## Implementation Strategy

### MVP — US1 (+ US2 для точності)

Phase 1–2 → US1 → перевірка в грі → US2. Цього досить для пака 0.9.0, якщо час підтискає.

### Далі

US3 (підпис і історія) → US4 (довідник) → Polish → перевірка US4 з погодження власника. Злиття в `main` — лише за командою «добав у пак».
