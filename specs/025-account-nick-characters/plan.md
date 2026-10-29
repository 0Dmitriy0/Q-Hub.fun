# Implementation Plan: Нік акаунта й персонажі зі своїм статіком

**Branch**: `025-account-nick-characters` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/025-account-nick-characters/spec.md`

## Summary

Нік і статік зараз живуть у профілі акаунта; подача цін, рейтинг, «Останні оновлення», мапа й «наступна зміна цін»
читають їх звідти. Переносимо: **нік** — новий стовпець акаунта, який гравець вибирає сам (унікальний, раз на 30 днів);
**статік** — у персонажа (унікальний на всю систему, ≤ 3 персонажі на акаунт); **ціна** — з `character_id`, який
база перевіряє замість профільного статіку. Публічні зведення показують лише нік, біля ціни — ще Ім'я_Прізвище;
статік зникає з публічного. Наявні статіки переносяться на персонажів однією міграцією, старі стовпці лишаються для
відкату. Програма: крок «нік» у вікні входу, шапка «нік / Ім'я_Прізвище #статік», «зір» пише від поточного персонажа.
Сайт: вибір персонажа при ручній ціні, нік замість статік-воріт.

## Technical Context

**Language/Version**: TypeScript 5 (сайт, React 18 + Vite), CommonJS Node 22 / Electron 37 (програма), PL/pgSQL (Supabase Postgres)
**Primary Dependencies**: `@supabase/supabase-js`, React Router; без нових залежностей
**Storage**: Supabase Postgres — `profiles`, `characters`, `price_reports` і зведення над ними
**Testing**: `vitest` (сайт), `node --test` (програма), SQL-тести `supabase/tests/run.sh` (CI, Linux)
**Target Platform**: сайт q-hub.fun (GitHub Pages), Q-Hub Desktop для Windows
**Project Type**: веб-сайт + desktop-програма над спільною базою
**Performance Goals**: перевірки в тригері — індексні запити по `owner`/`id`; подача ціни не повільніша, ніж зараз
**Constraints**: старі версії програми (0.4.x) мусять і далі подавати ціни для акаунтів з одним персонажем;
міграція ідемпотентна, без видалення стовпців; статік не потрапляє в публічні зведення
**Scale/Scope**: десятки акаунтів, ≤ 3 персонажі на акаунт; 1 міграція, ~4 зведення, ~10 файлів сайту, ~4 програми

## Constitution Check

*GATE: перевірено до Phase 0 і після Phase 1.*

| Принцип | Як дотримано |
|---|---|
| I. Зовнішній інструмент | гра не зачіпається; «зір» лише додає `character_id` до того, що вже надсилає |
| II. Права — у базі | формат, унікальність, ліміт 3, «раз на 30 днів», належність персонажа — тригери/check; RLS персонажів без змін |
| III. Знімки приватні | не зачіпається |
| IV. Перевірені дані | підтвердження цін і далі рахує різні **акаунти** (R8) — персонажі одного гравця не голосують окремо |
| V. Програма лише додає | ⚠ відхилення — див. Complexity Tracking |
| VI. Тести | `supabase/tests/account_nick_test.sql` (дозвіл і заборона для anon і `user`), `node --test` для `parseNick`, `vitest` для зведень і вибору персонажа |
| Безпека й секрети | нових секретів немає |
| Міграції | новий файл `0038_…`, `if not exists` / `drop … if exists`, застосовані не переписуються |

**Результат**: пройдено з одним поясненим відхиленням (V).

## Project Structure

### Documentation (this feature)

```text
specs/025-account-nick-characters/
├── spec.md
├── plan.md              # цей файл
├── research.md          # R1–R9
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── db.md            # запис, читання, тексти відмов, що перевіряє SQL-тест
│   └── desktop-ipc.md   # state / nickSet / charAdd, вікно входу, шапка, «зір»
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/
├── migrations/0038_account_nick_characters.sql   # стовпці, тригери, check_buyer_report, set_next_change,
│                                                 # report_unknown_item, 4 зведення, перенесення
└── tests/account_nick_test.sql (+ рядок у run.sh)

desktop/src/
├── nick.cjs + nick.test.cjs        # parseNick
├── character.cjs                   # без змін формату
├── main.cjs                        # state() з nick і static, nick-set, char-add → characters.static_id,
│                                   # character_id у autoPrices/autoNextChange/autoUnknown
├── preload.cjs                     # nickSet
├── index.html, renderer.js         # крок «нік», плитки «Ім'я_Прізвище #статік», «+ Новий» ховається на 3
└── src/data/changelog.json (через сайт)

src/
├── lib/auth.tsx                    # nick, nickChangedAt, saveNick; characters зі static_id; без gameName/staticId
├── lib/updates.ts                  # reporter_id, reporter_character; без reporter_static
├── components/StaticGate.tsx → NickGate.tsx   # ворота: нік (не статік); форма ніка з «можна знову з …»
├── components/CharacterPick.tsx    # вибір персонажа перед ручною ціною (2–3 персонажі)
├── components/Leaderboard.tsx      # name = нік
├── pages/Prices.tsx, components/ShotImport.tsx   # character_id + CharacterPick; без « #статік» біля автора
├── pages/cabinet/Characters.tsx    # поле статіку, ≤ 3, список зі статіком (лише власнику)
├── pages/cabinet/SettingsPage.tsx  # форма ніка замість «нік персонажа + статік»
├── pages/cabinet/Cabinet.tsx       # шапка — нік
├── desktop/Bar.tsx, desktop/Settings.tsx       # шапка «нік / Ім'я_Прізвище #статік», FAQ
├── lib/mapDrafts.ts, lib/mapMarks.ts, pages/MapPage.tsx   # автор — нік; власник мітки — з map_owners (персонаж)
└── data/changelog.json
```

**Structure Decision**: наявна структура (сайт у `src/`, програма в `desktop/src/`, база в `supabase/`); нових
каталогів немає, два нові компоненти й один модуль програми.

## Етапи (для tasks.md)

1. **База** (блокує все): міграція 0038 + SQL-тест. Сумісна зі старими клієнтами (R5 п. 3), тож може вийти першою.
2. **US1 персонажі зі статіком**: `charAdd` → персонаж; кабінет — поле статіку, ліміт 3.
3. **US2 нік**: `parseNick`, крок у вікні входу, `NickGate` на сайті, шапки, зведення з ніком.
4. **US3 ціна від персонажа**: `character_id` у «зорі» й ручних цінах, `CharacterPick`, «нік · Ім'я_Прізвище» в оновленнях.
5. **US4 перенесення**: перевірка на реальних даних після міграції (SC-004), журнал оновлень.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| V. «Програма лише додає» — програма змінює профіль (нік), змінює й видаляє персонажів | з 0.3.0 кабінет на сайті лише для перегляду: програма — єдине місце, де гравець керує акаунтом. Причина принципу V (конфлікти з сайтом) для профілю й персонажів більше не діє; облік, склад і ціни програма й далі лише додає | залишити керування на сайті — суперечить рішенню 0.3.0 «уся програма в одній плашці» і тому, що сайт уже не дає створити персонажа (тестери застрягли саме на цьому). **Рекомендація**: уточнити принцип V в конституції (PATCH): «записи обліку, цін і чернеток — лише додає; профіль і персонажів — керує власник» |
