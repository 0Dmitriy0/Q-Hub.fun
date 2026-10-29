# Implementation Plan: Банер «Карта привидів» відкриває мапу лише з привидами

**Branch**: `005-promo-ghosts-map` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-promo-ghosts-map/spec.md`

**Note**: план складено **після** реалізації (коміт `41f020b`). Тут описано, як усе зроблено, і що в коді досі розходиться зі спекою.

## Summary

Банер на головній веде на `/mapa?show=pryvydy`. `MapPage` читає параметр `show` у тимчасовий стан `only` (його не збережено в `localStorage`). Поки `only` задано, `isOn` показує лише цю категорію й шар «Назви». Після завантаження даних `only` скидається, якщо в категорії немає міток. Перше перемикання фільтра знімає `only` і зберігає те, що гравець бачить у цю мить. Параметр одразу прибирається з адреси (`history.replaceState`), тому після оновлення сторінки повертається звичайна мапа.

Розбіжності, які лишилися після реалізації (деталі в [research.md](research.md)):

1. **FR-003 ≠ код.** Спека вимагає «стартовий вид мапи», а код наводить кадр (`fitBounds`) на всі мітки привидів. Рекомендація: змінити формулювання FR-003 на «кадр, у якому видно всі мітки категорії» (R2).
2. **Міграції ≠ жива база.** У `0015_map.sql` категорія має id `ghosts`, а в робочій базі — `pryvydy`: 20 міток, перевірено anon-запитом 2026-10-27. На свіжій або локальній базі банер мовчки відкриє звичайну мапу (R3).
3. **Принцип VI.** Логіка вибору фільтрів вбудована в компонент, і модульного тесту на неї немає (R4).

## Technical Context

**Language/Version**: TypeScript 7.0, React 19.3

**Primary Dependencies**: react-router-dom 7.18, Leaflet 1.9.4, @supabase/supabase-js 2.117

**Storage**: Supabase (`map_categories`, `map_points`) лише читається; фільтри гравця в `localStorage` (`ON_KEY`) лише читаються, доки гравець нічого не перемкнув

**Testing**: vitest (`npm.cmd test`), ручна перевірка за [quickstart.md](quickstart.md)

**Target Platform**: сайт (SPA, Vite), десктопні й мобільні браузери

**Project Type**: web-app (фронтенд + Supabase)

**Performance Goals**: без мерехтіння: до завантаження категорій не показувати всі мітки на мить

**Constraints**: без змін у базі та RLS; приватний режим браузера (localStorage кидає помилку) не ламає вид

**Scale/Scope**: 2 файли (`src/pages/Home.tsx`, `src/pages/MapPage.tsx`), 1 категорія, ~20 міток

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Пояснення |
|---|---|---|
| I. Зовнішній інструмент | ✅ н/з | Лише сайт, гри не стосується |
| II. Права — у базі | ✅ | Читаються лише публічні мітки й категорії, нових запитів і політик немає |
| III. Знімки приватні | ✅ н/з | — |
| IV. Власні дані | ✅ | Нових даних немає. Окремо: файл `supabase/seed/map_quantfun.sql` за назвою схожий на дані з quantfun.com.ua; це варто перевірити поза цією функцією [Вгадайте] |
| V. Програма лише додає | ✅ н/з | — |
| VI. Тести на логіку | ⚠️ | Правило «лише ця категорія + назви / збережене / за замовчуванням» і злиття при першому перемиканні — чиста логіка без тесту. Закривається винесенням у `src/lib/mapFilters.ts` + vitest (R4) |
| Процес розробки | ⚠️ | Реалізація була раніше за план (спека: «рішення власника»). Порушення процесу, яке власник прийняв свідомо, фіксуємо тут |

**Після Phase 1**: VI лишається ⚠️, доки не з'явиться тест. Блокером для злиття вважаю саме його: решта пунктів — документація.

## Project Structure

### Documentation (this feature)

```text
specs/005-promo-ghosts-map/
├── plan.md              # цей файл
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── map-url.md       # контракт адреси /mapa?show=<id>
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (ще немає)
```

### Source Code (repository root)

```text
src/
├── pages/
│   ├── Home.tsx         # банер → /mapa?show=pryvydy (зроблено)
│   └── MapPage.tsx      # стан only, isOn, fitBounds, setMany/resetOn (зроблено)
└── lib/
    ├── mapFilters.ts    # ДОДАТИ: чиста функція вибору видимих категорій (R4)
    └── mapFilters.test.ts  # ДОДАТИ: vitest

supabase/migrations/
└── 0027_ghosts_id.sql   # ДОДАТИ (за рішенням власника, R3): ghosts → pryvydy, ідемпотентно
```

**Structure Decision**: Наявна структура SPA. Нових модулів, крім `src/lib/mapFilters.ts`, не додаємо.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Код до плану | Власник вирішив зробити зміну у двох файлах без плану | — (зафіксовано заднім числом; на майбутнє не прецедент) |
| id категорії в адресі (`pryvydy`), а не окремий ключ | Не потрібен словник «ключ → категорія»; працює для будь-якої категорії | Окремий ключ на кшталт `?promo=ghosts` — зайвий шар; проте адреса ламається, якщо адмін перейменує id (R3) |
