# Implementation Plan: Етап 1 програми — сповіщення й промокод (075, 076, 077)

**Branch**: `075-stage1-alerts` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md), [076](../076-event-reminders/spec.md), [077](../077-promo-tab/spec.md)

Один план на три фічі: у них спільні логіка й склейка. Третьою спершу був таймер оголошення на маркеті — його прибрано до злиття (рішення власника 2026-11-10), замість нього — промокод над плашкою (specs/077-promo-tab). У 076 і 077 — лише свої частини.

## Summary

Два сповіщення Windows з програми: «час здавати» (товар, за яким стежиш, ≥ 80% діапазону) й івент за 10 хв; і промокод Q-Hub над плашкою, коли івентів поруч немає. Уся логіка — чисті функції в `src/lib/alerts.ts` поверх наявних `advise` / `GOOD` / `STALE` (`advice.ts`, `pricestats.ts`) і `eventStatus` (`events.ts`); збірка кладе їх у `desktop/src/lib/alerts.cjs` для головного процесу. `main.cjs` лише тикає раз на 20 с, зберігає стан у `settings.json` і показує `Notification`. Інтерфейс — дзвіночок у «Цінах», вкладка промокоду над плашкою, розділ «Сповіщення» в налаштуваннях.

## Technical Context

**Language/Version**: TypeScript 7 (логіка, інтерфейс), Node/CommonJS в Electron 37 (головний процес)
**Primary Dependencies**: наявні — React 19, Vite 8, Electron `Notification`; нових немає
**Storage**: `userData/settings.json` (як решта налаштувань); бази й міграцій немає
**Testing**: vitest (`src/lib/alerts.test.ts`), `node --test` (`desktop/src/*.test.cjs`)
**Target Platform**: Windows 10/11
**Project Type**: desktop-програма (Electron) + спільний код із сайтом
**Performance Goals**: тик — мікросекунди; мережа — один запит цін на 5 хв і лише коли є позначені товари
**Constraints**: сповіщення ±30 с; нічого не робити в грі; нічого не писати в базу
**Scale/Scope**: ≤ 50 позначених товарів, 5 івентів

## Constitution Check

| Принцип | Стан |
|---|---|
| I. Зовнішній інструмент | ✅ дані — ціни сайту, розклад у коді, години вводить гравець; у грі програма нічого не робить |
| II. Права — у базі | ✅ нових даних у базі немає; ціни читаються тим самим публічним запитом |
| III. Знімки приватні | ✅ знімків немає |
| IV. Власні й перевірені дані | ✅ поріг і вік ціни — ті самі сталі, що на сайті; застаріла ціна не сповіщає |
| V. Програма лише додає | ✅ у базу не пише взагалі; склад і облік не повертаються (specs/040) |
| VI. Тести на права й логіку | ✅ уся логіка в чистих функціях з тестами; прав не чіпаємо |

Порушень немає, Complexity Tracking порожній. Після проєктування — без змін.

## Project Structure

### Documentation

```text
specs/075-sell-alert/      plan.md (цей), research.md, data-model.md, contracts/ipc-alerts.md, quickstart.md, tasks.md
specs/076-event-reminders/ plan.md, tasks.md
specs/077-promo-tab/       spec.md, plan.md, tasks.md
```

### Source Code

```text
src/lib/alerts.ts            # sellDue, eventDue, promoShown + тексти сповіщень (нове)
src/lib/alerts.test.ts       # тести логіки (нове)
vite.lib.config.ts           # друга точка входу → desktop/src/lib/alerts.cjs
desktop/src/main.cjs         # notify(), тик, IPC, налаштування
desktop/src/preload.cjs      # watchToggle, watchClear, notifyTest
desktop/src/store.cjs        # writeAtomic, trimLog (аудит)
src/desktop/Bar.tsx          # дані watch/promo, вкладки над плашкою
src/desktop/Bar.tsx (Tabs)   # вкладка промокоду поруч з івентом
src/desktop/barParts.tsx     # дзвіночок у Prices
src/desktop/Settings.tsx     # розділ «Сповіщення»
src/desktop/bar.css
src/data/changelog.json, desktop/package.json (0.8.0)
```

**Structure Decision**: логіка в `src/lib`, а не в `desktop/src/*.cjs`: так вона справді використовує `advise`, `GOOD`, `STALE` і `EVENTS`, а не їх копії. Ціна — головний процес отримує її лише після збірки (`npm run ui`, як `shotparse.cjs`).

## Complexity Tracking

Порожньо.
