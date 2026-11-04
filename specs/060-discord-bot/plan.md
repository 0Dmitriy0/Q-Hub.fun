# Implementation Plan: Discord-бот Q-Hub — новини й ціни скупників у канал

**Branch**: `060-discord-bot` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/060-discord-bot/spec.md`

## Summary

Бот лише **пише** в Discord (читання інших серверів — окрема майбутня функція, FR-011), тож постійний процес із
з'єднанням Gateway не потрібен: досить Discord REST API з токеном бота. План:

- **Ціни.** Підтверджена зміна ціни вже пише рядок у `price_history` (тригер `buyer_items_price_log`, 0003). Новий тригер
  кладе подію в чергу `discord_outbox`. Щохвилини `pg_cron` кличе функцію Supabase `discord-bot`: вона збирає зміни
  всіх скупників за вікно (5 хв, подовжується під ліміт ~10 пересилань на годину з каналу-оголошення), публікує **одне
  нове** повідомлення в канал цін і пересилає його підписникам (`crosspost`). Стабільний ключ вікна — без дублів.
- **Новини.** Таблиця `news_drafts`. Після кожного деплою сайту крок GitHub Actions передає функції новий запис
  `src/data/changelog.json` (програма) і новий запис `src/data/sitenews.json` (сайт; новий файл, щоб не змішувати з
  журналом програми). Функція створює чернетку (один раз на `source_ref`). В адмін-панелі — розділ «Новини»: перегляд
  як у Discord, правка, «Об'єднати», «Не публікувати», «Надіслати в Discord».
- **Налаштування.** Однорядкова `discord_bot` (сервер, канали, увімкнено ціни / новини), розділ адмінки «Discord-бот»:
  стан, канали, пробне повідомлення. Токен — лише в секретах функції.

## Technical Context

**Language/Version**: TypeScript 5 + React 18 (сайт), Deno (Supabase Edge Function), PostgreSQL (Supabase)

**Primary Dependencies**: `@supabase/supabase-js` (наявна, у функції — `npm:@supabase/supabase-js@2.117.2`, як rules-sync);
Discord REST API v10 через `fetch`; розширення Postgres `pg_cron` і `pg_net` (вмикає власник у Supabase Dashboard); нових
npm-залежностей немає

**Storage**: Supabase — `discord_bot` (1 рядок), `discord_outbox`, `news_drafts` (міграція `0052`; `0050` зайнята
`claude/fervent-lamport-cg3ldl`, `0051` — specs/055); секрети функції `DISCORD_BOT_TOKEN`, `DISCORD_SYNC_SECRET`

**Testing**: `vitest` (`supabase/functions/discord-bot/*.test.ts` — формат повідомлень, вікно й ліміт, розбір журналу);
SQL-тест прав `supabase/tests/discord_bot_test.sql`

**Target Platform**: Supabase Edge Functions + сайт Q-Hub.fun (адмін-панель)

**Project Type**: вебсайт + серверна функція над спільною базою

**Performance Goals**: 95% підтверджених змін у Discord ≤ 2 хв (SC-001): опитування щохвилини + вікно збирання

**Constraints**: ≤ ~10 пересилань на годину з каналу-оголошення (Discord; уточнити за документацією в T001); без дублів
(SC-002); лише підтверджені ціни (SC-003); токен ніколи в репо й бандлі (SC-006); налаштування — лише `admin`

**Scale/Scope**: ~10 скупників, десятки змін на день; 1 функція, 2 розділи адмінки, 1 міграція, 1 крок CI

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Стан | Як виконано |
|---|---|---|
| I. Зовнішній інструмент | ✅ | Гри не торкається; пише в Discord Q-Hub |
| II. Права — у базі | ✅ | `discord_bot`, `news_drafts`, `discord_outbox` — лише `admin` (RLS); функція працює з service role і перевіряє admin-сесію або секрет; нових ролей немає |
| III. Знімки приватні | ✅ | Знімків немає; ніків тих, хто вносив ціни, у повідомленнях немає (FR-012) |
| IV. Перевірені дані | ✅ | Черга наповнюється лише з `price_history`, куди потрапляє тільки підтверджена ціна (0043) |
| V. Програма лише додає | ✅ | Програму не змінюємо |
| VI. Тести | ✅ | SQL-тест: anon / user / editor / moderator не читають і не пишуть таблиці бота, admin — так; тригер черги; модульні тести формату й вікна |
| Безпека й секрети | ✅ | `DISCORD_BOT_TOKEN`, `DISCORD_SYNC_SECRET` — лише в секретах функції й GitHub Secrets |

**Gate**: ✅ — порушень немає.

**Re-check після Phase 1**: ✅. Нова залежність від розширень `pg_cron` / `pg_net` — інфраструктура Supabase, не порушення;
запасний шлях без них — GitHub Actions cron кожні 5 хв (повільніше за SC-001, див. research R2).

## Project Structure

### Documentation (this feature)

```text
specs/060-discord-bot/
├── spec.md
├── plan.md                  # цей файл
├── research.md              # Phase 0
├── data-model.md            # Phase 1
├── quickstart.md            # Phase 1
├── contracts/
│   ├── discord-bot-function.md   # дії функції, хто кличе, секрети
│   └── messages.md               # вигляд повідомлень цін і новин
├── checklists/requirements.md
└── tasks.md                 # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/0052_discord_bot.sql       # discord_bot, discord_outbox, news_drafts, тригер з price_history, cron
├── tests/discord_bot_test.sql            # права й тригер черги
└── functions/discord-bot/
    ├── index.ts                          # дії: tick (ціни), drafts (з CI), send (новина), test, status
    ├── discord.ts                        # REST: send, crosspost, перевірка прав каналу; 429 → retry_after
    ├── prices.ts                         # вікно збирання, ліміт пересилань, ключ вікна (чисте)
    ├── format.ts                         # повідомлення цін і новин (чисте)
    ├── changelog.ts                      # запис журналу / sitenews → пункти чернетки (чисте)
    └── *.test.ts

src/
├── data/sitenews.json                    # «що нового на сайті» мовою гравця (новий; змінами лише сайту)
├── components/admin/AdminNews.tsx        # чернетки, перегляд як у Discord, «Надіслати»
├── components/admin/AdminDiscordBot.tsx  # стан, канали, пробне
├── components/admin/DiscordPreview.tsx   # спільний перегляд повідомлення (той самий format.ts)
└── pages/Admin.tsx                       # два нові розділи

.github/workflows/deploy.yml               # крок після деплою: передати новий запис журналів функції (drafts)
.claude/memory/                            # спогад: зміни сайту → sitenews.json (як changelog.json для програми)
```

**Structure Decision**: функція поруч з `rules-sync` і `assistant`; чисті модулі функції тестуються тим самим `vitest`
(`supabase/functions/**/*.test.ts` уже в `vite.config.ts`). `format.ts` імпортує й сайт для перегляду, щоб перегляд у
адмінці збігався з тим, що піде в Discord.

## Complexity Tracking

Порушень конституції немає — розділ порожній.
