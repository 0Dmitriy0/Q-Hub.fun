# Implementation Plan: Івенти у WIKI — плитки, сторінка івенту й мапа з мітками

**Branch**: `055-wiki-events` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/055-wiki-events/spec.md`

## Summary

Івенти вже є: таблиця `season_events` (0025, 0034) живить блок «Найближчі івенти» на головній, а папка «Івенти» на
мапі має категорії з датами (specs/018). План розширює `season_events` замість нової сутності: адреса сторінки
(`slug`), тип (звичайний / батл пас), фото, повний опис, посилання на попередній раз. Додаються дві малі таблиці:
прив'язка івенту до категорій мапи й рівні батл пасу. На сайті — вкладка WIKI «Івенти» (банер поточного батл пасу,
плитки, фільтр «Тривають / Скоро / Архів») і сторінка івенту з міні-мапою його міток та переходом на велику мапу
через наявний параметр `?show=` (він уже приймає кілька категорій через кому). Стан і дати рахують наявні функції
`phase` / `range` з `src/lib/seasons.ts`. Програму функція не змінює.

## Technical Context

**Language/Version**: TypeScript 5 + React 18 (сайт), PostgreSQL (Supabase)

**Primary Dependencies**: react-router-dom, `@supabase/supabase-js`, Leaflet (уже на мапі); нових залежностей немає

**Storage**: Supabase — нові колонки `public.season_events`, нові таблиці `public.season_event_maps`,
`public.season_event_levels` (міграція `0051`; `0050` зайнята гілкою `claude/fervent-lamport-cg3ldl`); фото — наявний
публічний бакет `catalog`, тека `events/` з правом завантаження для staff

**Testing**: `vitest` (`src/lib/seasons.test.ts` + новий `src/lib/eventsWiki.test.ts`), SQL-тест прав
`supabase/tests/season_events_wiki_test.sql`

**Target Platform**: сайт Q-Hub.fun (браузер, 375–1280 px)

**Project Type**: вебсайт над спільною базою

**Performance Goals**: вкладка з 50 івентами відкривається < 1 с; міні-мапа з'являється, коли до неї доскролили
(не вантажить тайли, доки не видно)

**Constraints**: змінює івенти лише staff (RLS); дані з гри й офіційних оголошень (принцип IV); дати за київським часом

**Scale/Scope**: десятки івентів на рік, до кількох сотень міток на івент; 2 сторінки сайту, 1 міграція

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Стан | Як виконано |
|---|---|---|
| I. Зовнішній інструмент | ✅ | Лише сайт; гри не торкається |
| II. Права — у базі | ✅ | Читають усі; змінюють `season_events` і нові таблиці лише `is_staff()` (`editor`, `moderator`, `admin`) — та сама політика, що вже діє з 0025. Фото: завантаження в `catalog/events/*` для staff, решта бакета — як було (admin) |
| III. Знімки приватні | ✅ | Знімків гравців немає; фото івентів — публічні промо-картинки |
| IV. Перевірені дані | ✅ | Опис і фото — з гри й офіційних оголошень QuantRP; мітки — з наявних перевірених партій мапи (лише опубліковані партії видно гостю) |
| V. Програма лише додає | ✅ | Програму не змінюємо |
| VI. Тести | ✅ | SQL-тест: anon і `user` не пишуть, staff пише, усі читають; модульні тести на впорядкування, банер і формат дат |

**Gate**: ✅ — порушень немає.

**Re-check після Phase 1**: ✅. Розбіжність зі spec виправлено в spec: FR-007 казав «лише `admin` і `editor`», а база
з 0025 дає писати `season_events` усім staff (з `moderator`). Власник 2026-11-04 дозволив `moderator` публікувати у
WIKI (056 Q2), тож spec приведено до бази, політику не звужуємо.

## Project Structure

### Documentation (this feature)

```text
specs/055-wiki-events/
├── spec.md
├── plan.md                  # цей файл
├── research.md              # Phase 0
├── data-model.md            # Phase 1
├── quickstart.md            # Phase 1
├── contracts/
│   └── events-ui.md         # адреси, вигляд плиток, банера й сторінки, форма staff
├── checklists/requirements.md
└── tasks.md                 # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/0051_season_events_wiki.sql   # колонки season_events, season_event_maps, season_event_levels, фото events/
├── tests/season_events_wiki_test.sql        # права: anon / user / editor / moderator / admin
└── tests/run.sh                             # + новий тест

src/
├── lib/seasons.ts            # SeasonEvent: нові поля; без змін логіки phase/range
├── lib/eventsWiki.ts         # чисте: впорядкування й фільтр (US1), вибір банера (US3), «Ще N дн.», slug
├── lib/eventsWiki.test.ts
├── pages/Wiki.tsx            # третя вкладка «Івенти» + лічильник тих, що тривають
├── pages/WikiEvents.tsx      # /wiki/iventy — банер, фільтр, плитки
├── pages/WikiEvent.tsx       # /wiki/iventy/:slug — сторінка, рівні батл пасу, мапа
├── components/EventMap.tsx   # міні-мапа Leaflet: baseMap + pinIcon + мітки прив'язаних категорій
├── components/EventForm.tsx  # форма staff: поля, фото, категорії мапи, рівні (заміна SeasonForm з EventsBlock)
├── components/EventsBlock.tsx  # плитка на головній веде на /wiki/iventy/:slug; форма → EventForm
├── App.tsx                   # маршрути; /iventy → /wiki/iventy (зараз → /)
└── styles.css                # плитки, банер, сторінка
```

**Structure Decision**: наявна структура сайту; сторінки WIKI — у `src/pages/` поруч з `Jobs.tsx` і `Transport.tsx`.
Програму (`desktop/`) і `changelog.json` не чіпаємо: WIKI в програмі немає (журнал — лише про програму).

## Complexity Tracking

Порушень конституції немає — розділ порожній.
