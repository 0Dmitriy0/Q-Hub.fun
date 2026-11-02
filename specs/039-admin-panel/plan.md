# Implementation Plan: Адмін-панель для розробників

**Branch**: `039-admin-panel` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/039-admin-panel/spec.md`

## Summary

Одна сторінка `/admin` для ролі `admin` із п'ятьма розділами:
- черги від програми;
- гравці й ролі;
- стан програми;
- навчальні знімки;
- переходи й налаштування.

Усі нові читання й дії йдуть через одну міграцію `0046_admin_panel.sql`. Це функції `security definer` з перевіркою `is_admin()` на початку й SQL-тест на дозвіл і заборону. Таблиці, які вже мають політики `admin` (`site_links`, `site_promo`, `buyer_items`, сховище `training`), панель використовує напряму.

Програма змінюється у двох місцях:
- передає свою версію в `app_ping`;
- враховує псевдоніми товарів (`items.aliases`) під час зіставлення назв у вікні скупника, щоб дія «Це вже є» справді працювала.

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (сайт, Vite); Node/Electron CommonJS (програма); SQL (PostgreSQL 15, Supabase).

**Primary Dependencies**: `@supabase/supabase-js`, `react-router-dom`; нових залежностей немає.

**Storage**: Supabase Postgres. Нові: стовпці `app_presence.version` і `app_presence.first_seen`, функції `admin_*`. Сховище `training` уже є.

**Testing**: `supabase/tests/admin_panel_test.sql` (через `run.sh`), `vitest` для чистої логіки сайту (`src/lib/admin.ts`), `node --test` для псевдонімів у програмі.

**Target Platform**: сайт q-hub.fun (десктоп ≥1280 px, телефон без горизонтальної прокрутки); Q-Hub Desktop (Windows).

**Project Type**: web-app + desktop-app (один репозиторій).

**Performance Goals**:
- лічильники черг видно за ≤3 с (SC-003);
- пошук акаунтів відповідає за ≤1 с;
- знімки вантажаться порціями по 50.

**Constraints**:
- RLS/функції — єдине джерело прав (конституція II);
- жодних даних обліку, складу чи балансів у відповідях;
- знімки — лише через тимчасові підписані посилання (III).

**Scale/Scope**: десятки–сотні акаунтів, 1–3 адміни, до тисяч знімків.

## Constitution Check

| Принцип | Як дотримано |
|---|---|
| I. Зовнішній інструмент | Програма лише додає версію в сигнал і локально зіставляє псевдоніми; у гру нічого не втручається. ✅ |
| II. Права — у базі | Кожна функція `admin_*` починається з `if not public.is_admin() then raise … '42501'`. Маршрут `/admin` у UI лише ховає. Роль змінює тільки `admin_set_role`, бо прямого `update (role)` клієнтам не видано й надалі. Нових ролей немає. ✅ |
| III. Знімки приватні | Читання сховища `training` лишається за `is_admin()` (0018). Файли віддаються через `createSignedUrls` на 10 хв. Строк зберігання — 90 днів, позначкою й ручним видаленням (spec, Assumptions). ✅ |
| IV. Перевірені дані | Невідомий товар не додається сам: лише дією адміна. «Підтвердити» ціну = ручне внесення staff, як і досі. ✅ |
| V. Програма лише додає | `app_ping` оновлює лише власний рядок присутності. Псевдоніми програма лише читає. ✅ |
| VI. Тести | `admin_panel_test.sql`: кожна функція перевіряється від anon, user, editor, moderator (відмова) і admin (дозвіл). Чиста логіка — `vitest` і `node --test`. ✅ |

Порушень немає, тож Complexity Tracking порожній.

**Повторна перевірка після дизайну** (data-model, contracts): нових таблиць з особистими даними немає. `admin_find_accounts` повертає лише нік, ім'я, аватар, роль, дати, версію й персонажів (ім'я, статік). Без `start_balance`, `goal` та інших полів обліку. ✅

## Project Structure

### Documentation (this feature)

```text
specs/039-admin-panel/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/admin-rpc.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
supabase/migrations/0046_admin_panel.sql   # app_presence.version, app_ping(p_version), admin_* функції
supabase/tests/admin_panel_test.sql        # дозвіл/заборона для кожної функції, захист останнього admin

src/pages/Admin.tsx                        # /admin: доступ, вкладки розділів, загальний лічильник
src/components/admin/AdminQueues.tsx       # US1: невідомі товари, межі, непідтверджені ціни, чернетки
src/components/admin/AdminAccounts.tsx     # US2: пошук, картка, зміна ролі
src/components/admin/AdminAppState.tsx     # US3: онлайн, версії, ШІ, завантаження
src/components/admin/AdminShots.tsx        # US4: мініатюри, перегляд, видалення
src/components/admin/AdminLinks.tsx        # US5: переходи + DiscordForm і PromoForm (винесені з Download/SitePromo)
src/lib/admin.ts (+ admin.test.ts)         # сортування версій, розбір назви релізу, розбір шляху знімка, «старий» знімок
src/App.tsx, src/components/Layout.tsx     # маршрут /admin, посилання «Адмінка» лише для admin

desktop/src/main.cjs                       # app_ping(p_version); items.aliases → додаткові назви для зіставлення
desktop/src/aliases.cjs (+ test)           # розгортання товарів за псевдонімами (чиста функція)
src/data/changelog.json                    # запис про версію в сигналі «онлайн» (FR-026)
```

**Structure Decision**: сайт і програма — наявна структура репозиторію. Панель — нова сторінка з компонентами в `src/components/admin/`. Форми Discord і промо виносяться з `Download.tsx` і `SitePromo.tsx` в експортовані компоненти, щоб не дублювати.

## Complexity Tracking

Порушень конституції немає.
