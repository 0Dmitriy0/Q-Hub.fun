# Research: Команда сайту (061)

## R1. Як віддати назовні лише дозволене

- **Decision**: таблиця `team_members` — RLS лише `admin`; назовні — подання `team_public` (security definer, як
  `prices_confirmed`), яке віддає по рядку на учасника: `member_id`, `real_name`, `photo_url` (або Discord-аватар з
  `profiles.avatar_url`), `about`, `sort`, `characters` (jsonb-масив `{name, static_id}` лише з `show_in_team`).
- **Rationale**: FR-005, FR-009 — гість не отримує `user_id`, ролі, інших персонажів.
- **Alternatives**: політика select на `characters` «або show_in_team» — відкрила б і баланс, і цілі персонажа; відкинуто.

## R2. Хто вмикає згоду

- **Decision**: колонка `characters.show_in_team boolean not null default false`; змінює власник через наявну політику
  «свої персонажі». `admin` її не змінить (політика `owner = auth.uid()`), що й потрібно (FR-010).
- Перемикач у `Characters.tsx` показується лише при `canEdit` (програма) і лише якщо власник у команді
  (`team_public` містить його — запит `team_members_me()` → boolean, security definer).

## R3. Фото

- **Decision**: бакет `catalog`, `team/<user_id>.webp`, кадр 320×320, наявний `PicUpload` (вантажить лише admin — 0006).
  Без фото — Discord-аватар, далі ініціали (`initials()` у `src/lib/team.ts`).
- Видалення акаунта: рядок `team_members` зникає каскадом; файл фото лишається в бакеті без посилань — прибирає адмін
  у розділі «Команда» («Сирітські фото: N»). Автоматичне видалення з бакета тригером не робимо (storage API поза SQL).

## R4. Пошук користувача в адмінці

- **Decision**: наявний список акаунтів для admin (0047, розділ «Гравці») — пошук за ніком; «Додати в команду».

## R5. Порядок

- **Decision**: `sort integer`; у адмінці — кнопки «вище / нижче» (без перетягування — простіше й доступно з клавіатури).
