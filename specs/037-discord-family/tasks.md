# Tasks: Discord сайту — сервер сім'ї CORE (+ specs/033)

## База
- [x] T001 `supabase/migrations/0045_site_links.sql`: таблиця, CHECK запрошення, тригер «хто змінив», RLS, стартове посилання
- [x] T002 `supabase/tests/site_links_test.sql` + рядок у `run.sh`: гість і гравець — ні, адмін — так, чужі посилання й другий рядок — ні, повторний запуск

## Спільне
- [x] T003 `src/lib/brand.ts` (`FAMILY`, `isDiscordInvite`, `useDiscord`) + `brand.test.ts`

## Сайт
- [x] T004 [033 US1, US2; 037 US3] `Layout.tsx` підвал: «by CORE» → Discord, опис, копірайт, кнопка «Discord Q-Hub»; `styles.css`
- [x] T005 [037 US1, US2] `Download.tsx`: «Спитати в Discord Q-Hub», форма посилання для адміна, «Програму робить сім'я CORE»
- [x] T006 [037 FR-002] `GameMapGuide.tsx`: своє поле інструкції, інакше загальне посилання

## Програма
- [x] T007 [037 FR-007] `desktop/src/main.cjs`: `siteDiscord()` у `barData`, кеш у `settings.discord`; плашка відкриває запрошення Discord
- [x] T008 [033 US3] `Settings.tsx`, `bar.css`: «Discord Q-Hub», «by CORE» біля версії, «Не знайшов відповіді» в частих питаннях
- [x] T009 `src/data/changelog.json`: запис `2026-11-01.2`

## Перевірка
- [x] T010 `npx.cmd tsc --noEmit`, `npx.cmd vitest run` (291), `cd desktop && npm.cmd test` (121), `vite build` — зелене
- [ ] T011 `supabase/tests/run.sh` — на Windows не запускається; проганяє CI (`deploy.yml`) після пушу
- [ ] T012 Власнику: застосувати 0045 на робочій базі
- [ ] T013 Власнику: на сервері CORE — канал Q-Hub, роль гостя без доступу до каналів сім'ї, запрошення безстрокове й без ліміту (SC-002: перевірити новим акаунтом)
- [ ] T014 Власнику: подивитися підвал на телефоні (360 px) у світлій і темній темі (033 SC-002)
