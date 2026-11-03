# Implementation Plan: Заробіток персонажа за годину в кабінеті

**Branch**: `044-cabinet-hourly-earnings` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/044-cabinet-hourly-earnings/spec.md`

## Summary

Програма вже пише рядок у `game_sessions` на кожен сеанс гри і щохвилини відсуває його кінець (`desktop/src/session.cjs`). Також вона вже рахує баланс HUD сеансу в пам'яті (`desktop/src/sessionmoney.cjs`). План: дописати в той самий рядок `game_sessions` підсумок грошей сеансу — баланс на початку й наприкінці, суму зростань («Заробив»), час першого й останнього стабільного зчитування і позначку «сумнівне». Підсумок пишеться разом із щохвилинним оновленням. Кабінет отримує нову вкладку «Заробіток»: весь час, дні в обраному проміжку, графік. Розрахунок днів і середніх — чиста функція на сайті з модульними тестами. Пороги («сумнівний стрибок», «мінімальна тривалість») — однорядкова таблиця `money_rules`, як `price_rules`.

## Technical Context

**Language/Version**: TypeScript 5 + React 18 (сайт), Node/Electron CommonJS (програма), PostgreSQL (Supabase)

**Primary Dependencies**: react-router-dom, `@supabase/supabase-js` (сайт і програма); нових залежностей немає

**Storage**: Supabase — нові колонки в `public.game_sessions` і нова однорядкова таблиця `public.money_rules` (міграція `0049`); локальний `settings.json` програми — стан поточного сеансу й черга невідправлених підсумків

**Testing**: `vitest` (сайт, `src/lib/earnings.test.ts`), `node --test` (програма, `desktop/src/sessionmoney.test.cjs`, `desktop/src/session.test.cjs`), SQL-тест прав `supabase/tests/session_money_test.sql`

**Target Platform**: сайт Q-Hub.fun (браузер), Q-Hub Desktop (Windows)

**Project Type**: вебсайт + десктопна програма над спільною базою

**Performance Goals**: перемикання проміжку дат < 2 с для року щоденних сеансів (~1 000 рядків, SC-003) — розрахунок у браузері над уже завантаженими рядками

**Constraints**: дані бачить лише власник (RLS); програма пише лише підсумок, без окремих зчитувань (FR-005); робота без інтернету (FR-006); аварійне закриття губить ≤ 5 хв (SC-005)

**Scale/Scope**: до 3 персонажів на акаунт, 1–5 сеансів на день; 1 вкладка кабінету, 2 модулі програми, 1 міграція

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Стан | Як виконано |
|---|---|---|
| I. Зовнішній інструмент | ✅ | Баланс — лише з наявного читання HUD зі знімка; нових дій у грі немає |
| II. Права — у базі | ✅ | `game_sessions` уже має політику «сесії персонажа» (`owns_character`): бачить і змінює лише власник, staff — ні. `money_rules` читають усі, змінює `admin`. Нових ролей немає |
| III. Знімки приватні | ✅ | Знімки не зберігаються; пишуться лише числа |
| IV. Перевірені дані | ✅ | Стрибок понад поріг не зараховується, сеанс позначається «сумнівне» й не входить у середнє; «немає даних» замість 0 $/год (FR-004, FR-011, FR-012) |
| V. Програма лише додає / без інтернету | ⚠️ **порушення** | Принцип 1.1.1: «баланс з HUD лише показує, у базу не пише». Функція пише підсумок сеансу. Офлайн-черга і стабільний `external_id` — виконано |
| VI. Тести | ✅ | SQL-тест: власник читає й пише, інший `user`, anon і `admin` — ні; модульні тести на розрахунок і накопичення |

**Gate**: план можна писати, але **реалізацію блоковано**, доки власник не погодить зміну принципу V (1.1.1 → 1.2.0, MINOR) — див. Complexity Tracking. Станом на 2026-11-03 згоди немає: власник обрав формулу (A — дві цифри), але про конституцію не відповів.

**Re-check після Phase 1**: дизайн нових порушень не додав. Підсумок пишеться в наявний рядок сеансу, а не в нову сутність «облік»; окремих операцій немає (FR-005).

## Project Structure

### Documentation (this feature)

```text
specs/044-cabinet-hourly-earnings/
├── spec.md
├── plan.md                    # цей файл
├── research.md                # Phase 0
├── data-model.md              # Phase 1
├── quickstart.md              # Phase 1
├── contracts/
│   ├── session-money.md       # що програма пише в game_sessions
│   └── cabinet-earnings.md    # вкладка «Заробіток»: вигляд і розрахунок
├── checklists/requirements.md
└── tasks.md                   # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/0049_session_money.sql     # колонки game_sessions + money_rules
└── tests/session_money_test.sql          # права: власник / інший user / anon / admin

desktop/src/
├── sessionmoney.cjs        # + сума зростань, поріг стрибка, позначка, summary()
├── sessionmoney.test.cjs   # нові тести накопичення
├── session.cjs             # tracker: upsert за id, гроші в кожному beat, офлайн-черга
├── session.test.cjs        # (новий або наявний) тести черги й upsert
├── main.cjs                # підключити money() у tracker, читати money_rules, текст Settings
└── ../../src/desktop/Settings.tsx   # «Нікуди не записує» → чесний текст (FR-017)

src/
├── lib/earnings.ts         # дні за Києвом, підсумки, пропуски — чиста функція
├── lib/earnings.test.ts
├── pages/cabinet/Earnings.tsx   # нова вкладка /kabinet/zarobitok
├── pages/cabinet/Cabinet.tsx    # маршрут + пункт меню
├── pages/Admin.tsx              # (налаштування) пороги money_rules
└── data/changelog.json          # запис про програму (зберігає підсумок сеансу)

.specify/memory/constitution.md   # принцип V → 1.2.0 (лише після згоди власника)
desktop/package.json              # 0.6.x → 0.7.0 (велике оновлення: програма знову пише дані)
```

**Structure Decision**: наявна структура проєкту (сайт у `src/`, програма в `desktop/src/`, база в `supabase/`). Нових пакетів і тек не додаємо.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Принцип V: програма пише баланс сеансу в базу (1.1.1 це забороняє) | «Середнє за весь час» і «по днях» (US1, US2) неможливі без збереження: зараз гроші живуть лише в пам'яті програми до кінця сеансу | Рахувати лише локально в програмі — кабінет на сайті нічого не побачить, а перевстановлення програми губить історію. Писати окремі зчитування — це знову облік (040), заборонено FR-005. Тому лише один підсумок на сеанс у наявному рядку `game_sessions`. Потрібна зміна конституції 1.2.0 за згодою власника |
