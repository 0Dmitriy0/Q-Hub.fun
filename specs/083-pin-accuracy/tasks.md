# Tasks: Точніші координати мітки Alt+F9

**Input**: Design documents from `specs/083-pin-accuracy/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R6), data-model.md, contracts/locate.md, quickstart.md

**Tests**: так — конституція, принцип VI; пороги точності на справжніх кадрах (`desktop/src/mapmatch.test.cjs`), `vitest` для прев'ю.

**Примітка власника (2026-11-14):** на його 16 кадрах місця впізнаються правильно, а мітки лягають «трохи криво» — головне в US1 саме уточнення положення, особливо на 40–85 м.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Зафіксувати вихідні цифри: `cd desktop && node --test --test-name-pattern="справжні кадри" src/mapmatch.test.cjs` — зберегти вивід (похибка по кожному кадру) у `specs/083-pin-accuracy/baseline.txt`; плюс прогін 16 кадрів власника скриптом зі scratchpad (`try-shots.cjs`, кадри лишаються в `C:\Users\User\Pictures\Screenshots`, у репо не йдуть) — підсумок дописати в той самий файл

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 `desktop/src/mapmatch.test.cjs`: функція звіту `bands(results)` — для смуг 50–100, 100–600, 600–1100 м: скільки кадрів, знайдено, медіана/90-й перцентиль похибки, макс; друк перед асертами (щоб кожен прогін показував прогрес). Асерти поки старі (≤ 30 м) — пороги міняються в T009

**Checkpoint**: тест друкує звіт по смугах, усе зелене як раніше.

---

## Phase 3: User Story 1 — Мітка там, де стояв хрестик (Priority: P1) 🎯 MVP

**Goal**: 100–600 м — ≥ 90 % у межах 10 м і 0 далі 20 м; 600–1000 м — ≥ 90 % у межах 20 м; 0 далі 50 м; на 40–85 м — частіше «знайдено», без хибних.

**Independent Test**: `node --test src/mapmatch.test.cjs` з новими порогами + прогін кадрів власника.

- [X] T003 [US1] `desktop/src/mapmatch.cjs`: функція `refine3(g, ui, ref, aim, s, p, opts)` — етап 3 «біля хрестика» за research R3: вікно навколо `aim` радіусом, що дає ~150–250 м (не менше 120 пікс знімка), крок `r3 = clamp(round(2·s), 1, 4)` м/пікс; еталон `renderRef(ref, r3, box)` навколо точки етапу 2 з запасом ±24 м; `ncc` по краях (`edges`) з маскою інтерфейсу; уточнення між пікселями (`subpixel`); перевірка половин (ліва/права) у межах 2 кроків `r3`. Повертає `{ x, y, score, agree, k }` у метрах гри або `null`
- [X] T004 [US1] Там само: підбір масштабу в `refine3` — перебір `s × (1 + k)`, `k ∈ {-0.04, -0.02, 0, 0.02, 0.04}`, найкращий бал (research R3)
- [X] T005 [US1] Там само, у `locate()`: етап 3 для **кожного** кандидата етапу 2 (до 5, не лише найкращого), рейтинг і відрив (`ratio`) — за балом етапу 3 (research R6: на дрібному кроці схожі ділянки розрізняються). Правила прийняття: бал етапу 3 ≥ поріг (старт 0,25, підібрати на наборі без контрольних кадрів), відрив ≥ `MIN_RATIO`, половини узгоджені; інакше — поведінка як зараз (точка етапу 2 з її перевірками або «unsure»). Результат: `x`, `y` з етапу 3; `match.fine3 = { r, k, score, agree, dx, dy }` (data-model.md)
- [X] T006 [US1] Там само: дозволити етап 3 для кадрів, де етап 2 дав `unsure` з відривом ≥ 1,0 (близький масштаб, research R6) — приймати лише за правилами T005
- [X] T007 [US1] Там само: `SCALE_MIN` — спробувати 35 м (кадри власника 42 і 48 м); лишити 35, лише якщо T009 зелений і 0 хибних; інакше повернути 50 і записати причину в research.md
- [X] T008 [US1] Час: у тесті заміряти середній час `locate` на кадр до/після (T001); якщо приріст > 300 мс — зменшити кількість кандидатів етапу 3 (найкращі 3) чи кроків масштабу (3 замість 5)
- [X] T009 [US1] `desktop/src/mapmatch.test.cjs`: нові пороги (contracts/locate.md, SC-001–SC-004): 100–600 м ≥ 90 % ≤ 10 м і 0 > 20 м; 600–1000 м ≥ 90 % ≤ 20 м; усі — 0 > 50 м; знайдено на 100–1000 м — не менше, ніж у T001. Якщо 10 м на 100–600 недосяжне без нових кадрів — зафіксувати досягнутий поріг (не гірше T001) і записати в research.md «ризик реалізувався»
- [X] T010 [US1] Прогнати 16 кадрів власника (scratchpad `try-shots.cjs`) і звірку з плитками (`cmp.mjs`): знайдено ≥ 6 (як було), Гранд-Сенора 63 м — зсув менший за ~20 м; результат — у `baseline.txt` (розділ «після»)

**Checkpoint**: тест із новими порогами зелений; кадри власника не гірше.

---

## Phase 4: User Story 2 — Видно, куди ляже мітка, до надсилання (Priority: P2)

**Goal**: у зеленій формі мітки — шматок мапи Q-Hub навколо точки з позначкою.

**Independent Test**: quickstart «У грі» п. 1; тест `pinPreview`.

- [X] T011 [P] [US2] Створити `src/desktop/pinPreview.ts`: `pinPreview(x, y, size = 240)` → `{ tiles: { z: 6, tx, ty, left, top }[], pin: { left, top } }` за data-model.md — через `toPx` з `src/lib/mapGeo.ts` (`ZMAX = 6`, `TILE = 256`); лише плитки з `0 ≤ tx, ty < 64`
- [X] T012 [P] [US2] Тести `src/desktop/pinPreview.test.ts`: точка в центрі мапи — позначка в центрі квадрата; плитки покривають увесь квадрат (сума площ); точка біля краю мапи — плитки поза межами відкинуто; одиниці — 0,78 м/пікс (`PX_PER_M`)
- [X] T013 [US2] `src/desktop/Bar.tsx`, `PinAsk`: у стані `ok` (є `ask.point`) під знімком у `.bleft` — блок `.bpinmap` 240×240 з плитками (`<img src={mapUrl('/map/6/' + tx + '/' + ty + '.webp')}>`, абсолютно) і позначкою-хрестиком у центрі; підпис «Мапа Q-Hub · сюди ляже мітка». Перевірити, що `mapUrl` у програмі веде на ті самі плитки, що мапа Alt+M (інакше — `asset()` як у мапі програми)
- [X] T014 [US2] `src/desktop/bar.css`: `.bpinmap { position: relative; width: 240px; height: 240px; overflow: hidden; border-radius: 10px; border: 2px solid var(--good); background: #0a0e11 }`, `.bpinmap img { position: absolute; width: 256px; height: 256px }`, позначка — хрестик кольору `--accent` з тінню

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T015 Журнал: у `src/data/changelog.json` верхній запис пака (`"pending": true`), `"changed"`: «Мітка з гри (Alt+F9): точніше місце — ближче до хрестика, особливо на наближеній карті; у формі видно мапу Q-Hub там, куди ляже мітка»
- [X] T016 `cd desktop && npm.cmd test`, `npx.cmd vitest run`, `npx.cmd tsc --noEmit -p .` — зелені; димова перевірка `main.cjs` (пам'ять `main-smoke-fake-electron`)
- [ ] T017 Головна сторінка Lavish (`.lavish/hub.html`, розділ 083): графік «до/після» з T001/T009/T010
- [ ] T018 Власнику: перевірка в грі за `specs/083-pin-accuracy/quickstart.md`

---

## Dependencies & Execution Order

- T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 (один файл `mapmatch.cjs` / тест — по черзі)
- US2 (T011–T014) незалежна від US1: T011 ∥ T012 можна починати одразу після T001
- T015–T018 — після обох історій

## Parallel Example

```text
Після T001:  US1 (T002…, desktop/src/mapmatch*.cjs)  ∥  T011 + T012 (src/desktop/pinPreview*.ts)
```

## Implementation Strategy

- **MVP**: T001–T010 — точність (головне прохання).
- US2 (T011–T014) — прев'ю у формі.
- Реліз — у паку (`pending`), за словом «випускай».
