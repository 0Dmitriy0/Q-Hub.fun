# Implementation Plan: Усі правила й закони QuantRP у програмі

**Branch**: `010-rules-sources` (робота — у власній гілці, у `main` — після зелених тестів) | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-rules-sources/spec.md`

## Summary

Зараз правила — `src/data/rules.json` (28 тем «Правил серверу»), який збирає `scripts/fetch-rules.mjs` і який доходить до
гравців лише з новою версією програми. Робимо:

1. **Розбір — спільний модуль** `supabase/functions/rules-sync/parse.ts`: той самий розбір постів IPS, що в
   `fetch-rules.mjs`, плюс заголовки «Стаття N…» і «Розділ…» кодексів (FR-004) і тип джерела в кожній темі (FR-003).
   `scripts/fetch-rules.mjs` використовує його ж (Node 24 читає `.ts`) — для вбудованої в програму запасної копії.
2. **Джерела — у базі**: таблиця `rule_sources` (розділ або тема форуму, тип, увімкнено, результат оновлення), RLS —
   лише `admin` (FR-009–FR-012). За замовчуванням — 2 розділи: «Правила серверу» (`rules`) і «Законодавча база штату»
   (`law`) (FR-001, FR-002).
3. **Оновлення — функція Supabase `rules-sync`**: обходить увімкнені джерела, розбирає, пише знімок `rules.json` у
   публічне сховище `rules`, записує в джерела кількість пунктів, різницю й помилку. Недоступне джерело чи 0 пунктів —
   пункти з попереднього знімка лишаються (FR-015, FR-016). Запуск: кнопка адміна (його сесія) і щодня GitHub Actions
   (`.github/workflows/rules-sync.yml`, секрет) — FR-013.
4. **Програма бере знімок без нової версії**: `desktop/src/rules.cjs` — завантаження зі сховища з ETag і кешем на диску;
   плашка отримує правила через міст, без інтернету — з кешу, далі з вбудованої копії, з датою «станом на» (FR-014, FR-017).
5. **Пошук і помічник**: тип і документ біля кожного результату (FR-005), розмовні назви кодексів («КК», «АК», «ПДР»)
   (FR-008), уривок для помічника з типом джерела й номером; підказка помічнику розрізняти правила сервера й закони
   штату й не вигадувати номерів (FR-006, FR-007).
6. **Сторінка адміна** `/admin/pravyla`: список джерел, додати посилання форуму, тип, увімкнути/вимкнути (зокрема тему
   всередині розділу), «Оновити зараз» і різниця (FR-009, FR-010, FR-016).

## Technical Context

**Language/Version**: TypeScript (Deno — функція Supabase; React 19 — сайт і плашка), JavaScript CommonJS (Electron 37), SQL (Postgres / Supabase)

**Primary Dependencies**: наявні — Supabase JS, Supabase Storage, Edge Functions (як `assistant`), GitHub Actions; нових пакетів немає

**Storage**: нова таблиця `rule_sources`; новий публічний бакет `rules` (`rules.json` — знімок); кеш програми
`%APPDATA%\Q-Hub\rules.json` (+ ETag); вбудована копія `src/data/rules.json`

**Testing**: `vitest` — розбір (`parse.ts`: пункти, статті, розділи, тип), пошук (аліаси кодексів, тип у результаті), уривок
для помічника; `node --test` — кеш знімка в програмі; SQL-тест `supabase/tests/rule_sources_test.sql` — anon / user /
admin (принцип VI); помічник — тест `plan.test.ts` на текст підказки

**Target Platform**: сайт (браузер), програма (Windows), функція Supabase (Deno)

**Project Type**: web + desktop + serverless function

**Performance Goals**: пошук < 0,3 с на базі ~2× більшій (SC-006); оновлення всіх джерел < 2 хв (ліміт функції)

**Constraints**: лише форум `forum.quant5.com.ua` (FR-011, принцип IV); правки джерел — лише `admin` у RLS (FR-012, принцип II);
форум не навантажувати — запити послідовно, ~53 теми раз на добу

**Scale/Scope**: 2 розділи, ~53 теми, ~1 400 + ~3 000 пунктів; знімок ~2–3 МБ (gzip ~0,5 МБ)

## Constitution Check

| Принцип | Як дотримано | Стан |
|---|---|---|
| I. Зовнішній інструмент | Гри не торкається; дані — з офіційного форуму сервера | ✅ |
| II. Права — у базі | `rule_sources` — RLS лише `admin`; знімок пише функція з service-ключем; кнопка «Оновити» перевіряє роль у функції | ✅ |
| III. Знімки приватні | Знімків екрана немає | ✅ |
| IV. Власні й перевірені дані | Лише форум QuantRP (джерело самої гри), інші хости відхиляються в базі й у функції; помічник не вигадує номерів | ✅ |
| V. Програма лише додає, офлайн | Програма лише читає знімок; без інтернету — кеш і вбудована копія з датою | ✅ |
| VI. Тести | SQL-тест на `rule_sources` (anon / user / admin), модульні тести розбору й пошуку | ✅ |

**Post-design re-check**: ✅, відхилень немає.

## Project Structure

### Documentation (this feature)

```text
specs/010-rules-sources/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/rules-sync.md     # функція: виклик, відповідь, різниця
├── contracts/rules-snapshot.md # формат знімка rules.json
└── tasks.md
```

### Source Code (repository root)

```text
supabase/
├── migrations/0037_rule_sources.sql     # таблиця, RLS, бакет rules, 2 джерела за замовчуванням
├── tests/rule_sources_test.sql          # + рядок у tests/run.sh
└── functions/rules-sync/
    ├── index.ts                          # обхід джерел, знімок у сховище, результат у джерела
    ├── parse.ts (+ parse.test.ts)        # розбір IPS: пости, пункти, статті, розділи
    └── merge.ts (+ merge.test.ts)        # новий знімок + старий: недоступне джерело лишається, різниця
.github/workflows/rules-sync.yml         # щодня 04:00 Києва, секрет RULES_SYNC_SECRET
scripts/fetch-rules.mjs                  # → тонка обгортка над parse.ts (вбудована копія)
src/
├── data/rules.json                       # вбудована копія: + закони штату, + kind
├── desktop/rulesSearch.ts (+ test)       # kind у результаті, аліаси кодексів, уривок з типом
├── desktop/Bar.tsx                       # правила з моста (знімок), позначка типу, «станом на»
├── pages/RulesAdmin.tsx                  # /admin/pravyla
└── App.tsx                               # маршрут
supabase/functions/assistant/plan.ts      # підказка: правила сервера ≠ закони штату, джерело кожного твердження
desktop/src/
├── rules.cjs (+ rules.test.cjs)          # знімок зі сховища: ETag, кеш, запасна копія
├── main.cjs, preload.cjs                 # rules-data
src/data/changelog.json
```

**Structure Decision**: розбір живе в одному модулі для функції й скрипта; програма лише споживає готовий знімок.

## Complexity Tracking

Відхилень немає.
