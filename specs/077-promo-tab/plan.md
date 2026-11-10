# Implementation Plan: Промокод Q-Hub над плашкою

**Branch**: `075-stage1-alerts` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

Технічний контекст і перевірка конституції — у спільному плані етапу [specs/075-sell-alert/plan.md](../075-sell-alert/plan.md).

## Своє

- `src/lib/alerts.ts`: `sitePromo(row)` — рядок `site_promo` → `{ code, reward } | null` (вимкнений, порожній, з недопустимими знаками — `null`); `promoCommand(code)`; `promoShown(now)` поверх `eventStatus` (`PROMO_QUIET = 15 хв`).
- `desktop/src/main.cjs`: `sitePromo()` читає `site_promo` раз на 30 хв, останній відомий — у `settings.promo`; у `bar-data` — `promo`.
- `src/desktop/Bar.tsx`: `Tabs` — вкладка івенту (як була) і вкладка промокоду, коли не «скоро»; клік — `navigator.clipboard.writeText('/promo …')`.
- Таймер оголошення прибрано цілком: `MarketTab.tsx`, функції `market*`, канали `market-set` / `market-clear`, `settings.market` (слід від тестової збірки стирається при запуску).

Конституція (I): програма лише кладе команду в буфер — вставляє гравець. Бази не змінює: `site_promo` читають усі (0031).
