# Implementation Plan: Статистика активності й сповіщення переможцям

**Branch**: `091-activity-stats` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/091-activity-stats/spec.md`

## Summary

Адмін бачить топ-10 гравців за період у трьох категоріях (ціни скупників, мітки на мапі, нові гайди), копіює готовий текст для Discord, вивантажує CSV, виключає внески чи гравців з причиною і надсилає переможцям сповіщення: на сайті (дзвіночок у шапці) і спробою в Discord DM зі статусом доставки.

Технічно (рішення власника): усі внески потрапляють в **єдину таблицю подій** `activity_events` `(user_id, category, entity_id, created_at, status)`, і статистика рахується лише з неї. Події пишуть **тригери на таблицях-джерелах**, тож шлях зміни не має значення. Агрегації — SQL-функції з індексом `(category, created_at)`, без окремого аналітичного сервісу. Доступ — лише `admin`, перевірка в базі. DM надсилає наявна edge-функція `discord-bot` у своєму щохвилинному `tick`.

## Technical Context

**Language/Version**: TypeScript 7 (сайт), SQL/PL/pgSQL (Postgres у Supabase), Deno (edge-функція `discord-bot`)

**Primary Dependencies**: React 19, react-router-dom 7, @supabase/supabase-js 2.117.2; нових залежностей немає

**Storage**: Supabase Postgres; нова міграція `0075_activity_stats.sql`

**Testing**: SQL-тести `supabase/tests/*.sql` через `run.sh`; vitest для сайту й логіки бота

**Target Platform**: сайт Q-Hub.fun (GitHub Pages через `deploy.yml`) + Supabase (БД, edge-функції, pg_cron)

**Project Type**: вебзастосунок (SPA) + BaaS; програма (Electron) **не змінюється**

**Performance Goals**: статистика за місяць ≤ 3 с (SC-008); лічильник сповіщень — один індексований `count`

**Constraints**: права лише в RLS/RPC (принцип II); цифри = факт (SC-001); виключення діє одразу (SC-003); DM ≤ 15 хв до кінцевого статусу (SC-007)

**Scale/Scope**: [Ймовірно] тисячі подій на місяць (ціни — основний обсяг), сотні гравців, кілька адмінів; 1 міграція, 1 нова вкладка адмінки, 1 компонент шапки, 1 крок бота

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Програма не змінюється; гри функція не торкається | ✅ |
| II. Права — у базі | Адмін-RPC з `is_admin()` усередині; RLS на всіх нових таблицях; сповіщення бачить і позначає лише отримувач; Discord-ідентифікатор віддається лише service role; нових ролей немає | ✅ |
| III. Знімки приватні | Знімки чернеток не читаються й не показуються; посилання ведуть на опубліковану мітку, а не на знімок | ✅ |
| IV. Власні й перевірені дані | Рахуються лише опубліковані й прийняті модерацією внески; число в топі звіряється з джерелами (`activity_sync_all`) | ✅ |
| V. Програма лише додає | Програму не змінюємо; тригер на `price_reports` лише читає її вставки | ✅ |
| VI. Тести на права й логіку | `activity_stats_test.sql`, `notifications_test.sql` (дозвіл і заборона для anon, `user`, `editor`, `moderator`); vitest для тексту Discord, CSV, шаблону, DM | ✅ |
| Безпека й секрети | Нових секретів немає; токен бота лишається в секретах функції | ✅ |
| Міграції | Новий ідемпотентний файл 0075; застосовані не переписуються | ✅ |

**Post-design re-check (після Phase 1)**: ✅ без змін. Модель і контракти не вводять ні ролей, ні клієнтських записів у спільні дані, ні публічних даних статистики.

## Project Structure

### Documentation (this feature)

```text
specs/091-activity-stats/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rpc.md
│   ├── discord-dm.md
│   └── ui.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/
├── migrations/0075…0079_*.sql              # події + тригери + топ; виключення; сповіщення; DM; налаштування
├── tests/activity_stats_test.sql           # права, правила зарахування, звірка з джерелами
├── tests/notifications_test.sql            # RLS сповіщень, ідемпотентність, функції бота
├── tests/run.sh                            # + мінімальна auth.identities
└── functions/discord-bot/
    ├── dm.ts / dm.test.ts                  # надсилання DM і мапа помилок
    ├── discord.ts                          # + openDm(), send з allowed_mentions
    └── index.ts                            # tick: крок dm

src/
├── lib/activityStats.ts / .test.ts         # текст для Discord, CSV, назва періоду, шаблон переможця
├── lib/notifications.ts                    # запити: лічильник, список, прочитання
├── components/admin/AdminStats.tsx         # вкладка: період, топи, гравець, виключення, налаштування
├── components/admin/AdminNotifications.tsx # історія + форма сповіщення
├── components/NotificationBell.tsx         # дзвіночок у шапці
├── components/Layout.tsx                   # + дзвіночок
├── pages/Admin.tsx                         # + вкладка 'stats'
└── data/sitenews.json                      # новина сайту
```

**Structure Decision**: Наявна структура: SPA у `src/`, база й функції в `supabase/`. Нових пакетів і сервісів немає.

## Порядок поставки

1. **MVP (US1 + US2)**: міграція (події, тригери, налаштування з типовими значеннями), `activity_top`, вкладка з топами, текст для Discord, CSV. Уже цього достатньо для щомісячного оголошення.
2. **US3 + US6**: виключення, список внесків гравця, налаштування.
3. **US4**: сповіщення на сайті (таблиця, RPC, дзвіночок, форма й історія).
4. **US5**: крок DM у боті.

Кожен етап — окремий PR з зеленими тестами. Міграції поділено за етапами: 0075 (події й топ), 0076 (виключення), 0077 (сповіщення), 0078 (DM), 0079 (RPC налаштувань), щоб MVP не чекав на решту.

## Complexity Tracking

Порушень конституції немає. Рішення, які свідомо ускладнюють систему:

| Рішення | Навіщо | Простіша альтернатива відкинута, бо |
|---|---|---|
| Таблиця подій-копія + тригери на 5 таблицях | Вимога власника: один формат, один індекс, нова категорія = новий тригер | View над джерелами простіший і не може розійтися з фактом; відкинуто рішенням власника. Ризик розбіжності знижено звіркою `activity_sync_all()` у тестах і RPC `activity_resync()` |
| Службові поля `source`, `source_id`, `group_key` понад 5 полів запиту | Ідемпотентне оновлення статусу; ліміт цін за добу без звернення до `price_reports` | Без них подію не можна оновити, коли змінюється джерело (у чернетки ще немає `entity_id`) |
