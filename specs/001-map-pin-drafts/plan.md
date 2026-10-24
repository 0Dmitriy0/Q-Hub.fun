# Implementation Plan: Чернетки міток з гри

**Branch**: `001-map-pin-drafts` (робота зараз іде в `claude/shot-regions`) | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-map-pin-drafts/spec.md`

## Summary

Редактор у грі відкриває велику карту й тисне F9. Програма знімає екран, читає масштаб зі шкали, знаходить іконку гравця і зіставляє **краї** знімка з еталоном мапи Q-Hub (`public/map/game/export.bin` — та сама геометрія, з якої Q-Hub робить текстури для гри). Тому інша палітра не заважає. Чернетка з координатами або «точку не визначено» йде через локальну чергу в нову таблицю `map_drafts` і закритий бакет `map-drafts`. Admin на сторінці мапи публікує чернетку в `map_points` або відхиляє — атомарними RPC.

## Technical Context

**Language/Version**: JavaScript (CommonJS, Node з Electron 37) — програма; TypeScript 7 + React 19 — сайт; SQL (Postgres / Supabase) — база

**Primary Dependencies**: Electron (`desktopCapturer`, `globalShortcut`, `worker_threads`), `@supabase/supabase-js` 2.117, `tesseract.js` 6 (наявний цифровий воркер), Leaflet 1.9 (мапа сайту). Нових залежностей немає.

**Storage**: Supabase Postgres (`map_drafts`), Supabase Storage (бакет `map-drafts`), локально `%APPDATA%\Q-Hub\drafts\` і `\map\`

**Testing**: `node --test` (програма), `vitest` (сайт), `supabase/tests/*.sql` через `run.sh` (CI)

**Target Platform**: Windows 10/11 (програма), браузер (сайт)

**Project Type**: desktop-app + web-app зі спільною базою

**Performance Goals**: F9 → оверлей ≤ 3 с у 95% (SC-001); зіставлення ≤ 1,5 с на 1920×1080

**Constraints**: лише знімок екрана (принцип I); без фокусу на оверлеї; працює без мережі після першого завантаження еталона; еталон ≈ 1,1 МБ

**Scale/Scope**: одиниці–десятки редакторів, сотні чернеток на місяць; 1 таблиця, 1 бакет, 3 RPC, 2 нові модулі програми, 1 панель сайту

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Як дотримано | До / після дизайну |
|---------|--------------|--------------------|
| I. Зовнішній інструмент | Лише знімок екрана й гаряча клавіша; карту відкриває гравець; програма нічого не натискає в грі | ✅ / ✅ |
| II. Права в базі | RLS на `map_drafts` і бакеті; `editor`/`moderator` лише `insert` своїх; публікація — RPC з `is_admin()`; `map_points` без змін | ✅ / ✅ |
| III. Знімки приватні | Закритий бакет; читають admin і автор; знімок не копіюється в мітку; видалення через 30 днів | ✅ / ⚠️ видалення залежить від того, чи заходить admin (R10) — у межах принципу, бо строк задає специфікація; ризик записано |
| IV. Перевірені дані | Нижче порогу впевненості координати не пишуться (R5); публікує людина | ✅ / ✅ |
| V. Лише додає, офлайн | Програма лише вставляє; черга на диску; `uuid` від програми, повтор = не дубль | ✅ / ✅ |
| VI. Тести | `map_drafts_test.sql` (anon, user, editor, moderator, admin); `mapmatch.test.cjs`, `outbox.test.cjs`; vitest для пошуку дублів | ✅ / ✅ |
| Безпека й секрети | Нових секретів немає; міграція — новий файл, ідемпотентна | ✅ / ✅ |

Гейт пройдено, порушень немає.

## Project Structure

### Documentation (this feature)

```text
specs/001-map-pin-drafts/
├── plan.md              # цей файл
├── research.md          # Phase 0: R1–R10
├── data-model.md        # Phase 1: map_drafts, бакет, локальні дані
├── quickstart.md        # Phase 1: перевірка end-to-end
├── contracts/
│   ├── database.md      # RLS, RPC, Storage, SQL-тести
│   └── desktop.md       # mapmatch, outbox, F9, оверлей
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/0019_map_drafts.sql      # таблиця, RLS, бакет, RPC publish/reject/mark_shots_deleted
└── tests/
    ├── map_drafts_test.sql             # нове
    └── run.sh                          # + виклик map_drafts_test.sql

desktop/src/
├── mapmatch.cjs + mapmatch.test.cjs    # шкала, іконка, краї, NCC, координати
├── mapmatch.worker.cjs                 # запуск у worker_threads
├── mapref.cjs                          # завантаження й кеш export.bin/json (ETag)
├── outbox.cjs + outbox.test.cjs        # черга чернеток
├── fixtures/map/                       # знімки великої карти + очікувані координати (не в інсталяторі)
├── main.cjs                            # роль, F9, flush кожні 30 с, pinKey у налаштуваннях
└── preload.cjs                         # подія 'pin' для плашки

src/
├── desktop/Bar.tsx, hotkey.ts          # повідомлення F9; поле клавіші в налаштуваннях
├── lib/mapDrafts.ts + .test.ts         # пошук поруч (30 м), формат статусів
├── components/MapDrafts.tsx            # панель «Чернетки»: список, знімок, публікація/відхилення
└── pages/MapPage.tsx                   # підключення панелі для isStaff, клік ставить/пересуває точку
```

**Structure Decision**: наявна структура — сайт у `src/`, програма в `desktop/src/`, база в `supabase/`. Нових пакетів немає. Логіка зіставлення — окремий модуль програми з тестами (як `hud.cjs` / `scene.cjs`). `fixtures/map/` не потрапляє в інсталятор: правило `files` у `desktop/package.json` треба доповнити `!src/fixtures/**`. Знімки для тестів у репозиторії — лише власні й без чату, ніків і чужих міток (принцип III). Знімки від тестувальників лишаються в закритому бакеті й у git не потрапляють.

## Порядок частин (кожну можна перевірити окремо)

1. **База**: міграція + SQL-тести. Перевірка: `run.sh` зелений.
2. **Модерація на сайті** з чернеткою, вставленою вручну (історії 2–3, сценарій 2.3). Уже дає цінність: точку ставить admin.
3. **Програма: F9 → чернетка без координат** (outbox, роль, оверлей). Кінець-у-кінець без зору.
4. **Програма: зіставлення** (`mapmatch`) + підбір порогів на наборі знімків до SC-002/SC-003.

## Complexity Tracking

Порушень конституції немає — таблиця не потрібна.
