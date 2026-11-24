# Implementation Plan: Команда сайту

**Branch**: `061-site-team` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/061-site-team/spec.md`

## Summary

Нова таблиця `team_members` (хто в команді: користувач, реальне ім'я, фото, опис, порядок) — пише лише `admin`.
Персонаж отримує позначку `show_in_team` — вмикає лише власник (наявна політика «свої персонажі» вже не пускає інших,
навіть `admin`). Назовні все йде через одне подання `team_public`: лише поля картки й лише дозволені персонажі
(нік, статік). На сайті: рядок аватарів унизу головної з «Уся команда», сторінка `/komanda`, посилання в підвалі,
розділ адмінки «Команда». Перемикач — у кабінеті біля персонажа там, де персонажами керують (у програмі,
конституція V); на сайті кабінет показує стан без зміни.

## Technical Context

**Language/Version**: TypeScript 5 + React 18 (сайт і кабінет у програмі), PostgreSQL (Supabase)

**Primary Dependencies**: наявні; нових немає

**Storage**: `public.team_members`, колонка `public.characters.show_in_team`, подання `public.team_public` (міграція
`0053`; `0050` — інша гілка, `0051` — 055, `0052` — 060); фото — бакет `catalog`, тека `team/` (наявні admin-політики 0006)

**Testing**: SQL-тест `supabase/tests/team_test.sql`; `vitest` для порядку й ініціалів (`src/lib/team.test.ts`)

**Target Platform**: сайт Q-Hub.fun; кабінет у Q-Hub Desktop

**Project Type**: вебсайт + кабінет у програмі над спільною базою

**Performance Goals**: головна не повільніша: рядок команди — один запит до `team_public`, лише коли блок видно

**Constraints**: персонажа без згоди не видно нікому, крім власника (SC-003); змінює команду лише `admin` (SC-005)

**Scale/Scope**: до ~20 людей; 1 сторінка, 1 блок головної, 1 розділ адмінки, 1 перемикач у кабінеті

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Стан | Як виконано |
|---|---|---|
| I. Зовнішній інструмент | ✅ | Гри не торкається |
| II. Права — у базі | ⚠️ уточнення | Персонажі — особисті дані. Публічно видно лише персонажа з `show_in_team = true`, і лише нік і статік, і лише якщо власник у команді. Вмикає тільки власник (наявна RLS `owner = auth.uid()`). Це свідомий виняток **за згодою власника даних** — PATCH-уточнення принципу II (див. Complexity Tracking) |
| III. Знімки приватні | ✅ | Знімків немає; фото команди вантажить `admin` (наявна політика `catalog`) |
| IV. Перевірені дані | ✅ | Картку вносить `admin` з відома людини |
| V. Програма лише додає / керування персонажами | ✅ | Перемикач — у кабінеті програми, де власник і так керує персонажами; кабінет на сайті — лише перегляд |
| VI. Тести | ✅ | SQL-тест: персонаж без згоди не видно в `team_public` для anon / user / admin; згоду не може ввімкнути ні `admin`, ні інший `user`; `team_members` пише лише `admin` |

**Gate**: ✅ з PATCH-уточненням конституції 1.2.0 → 1.2.1 (лише формулювання; погоджено власником 2026-11-04 відповіддю
на 061 Q1 «сама вмикає в кабінеті»).

**Re-check після Phase 1**: ✅ — подання віддає лише поля FR-002 і нічого з FR-009.

## Project Structure

### Documentation (this feature)

```text
specs/061-site-team/
├── spec.md
├── plan.md            # цей файл
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/team-ui.md
├── checklists/requirements.md
└── tasks.md           # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/
├── migrations/0053_team.sql        # team_members, characters.show_in_team, team_public
└── tests/team_test.sql

src/
├── lib/team.ts, team.test.ts       # порядок, ініціали, групування персонажів за людиною
├── components/TeamStrip.tsx        # рядок аватарів унизу головної + «Уся команда»
├── components/admin/AdminTeam.tsx  # пошук користувача, додати, фото, ім'я, опис, порядок, прибрати
├── pages/Team.tsx                  # /komanda — повні картки
├── pages/Home.tsx                  # + TeamStrip унизу
├── pages/Admin.tsx                 # + розділ «Команда»
├── pages/cabinet/Characters.tsx    # перемикач «Показувати в команді» (лише canEdit і лише для учасника команди)
├── components/Layout.tsx           # посилання «Команда» в підвалі
├── App.tsx                         # маршрут komanda
└── data/changelog.json             # запис: у кабінеті програми — «Показувати в команді»

.specify/memory/constitution.md      # 1.2.1 PATCH: виняток для персонажів, показ яких дозволив власник
```

**Structure Decision**: наявна структура; кабінет — спільний код сайту й програми (`src/pages/cabinet/`).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Принцип II: «персонажів бачить лише власник» — тепер нік і статік дозволеного персонажа видно всім | Картка команди показує персонажів (вимога власника сайту) | Вписувати нік і статік у картку вручну (061 Q1 B) — без згоди людини й застаріває; власник обрав згоду в кабінеті. Потрібне PATCH-уточнення формулювання принципу II |
