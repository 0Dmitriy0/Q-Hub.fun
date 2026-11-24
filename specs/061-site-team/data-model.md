# Data Model: Команда сайту (061)

Міграція `supabase/migrations/0053_team.sql`, ідемпотентна.

## `public.team_members`

| Колонка | Тип | Правило |
|---|---|---|
| `user_id` | uuid pk | FK `profiles(id) on delete cascade` — одна людина один раз (FR-004) |
| `real_name` | text not null | 1–60 |
| `photo_url` | text not null default `''` | `'' or ~ '^https://'` |
| `about` | text not null default `''` | ≤ 300 |
| `sort` | integer not null default 100 | |
| `created_at` | timestamptz not null default now() | |

RLS: усе — лише `is_admin()`.

## `public.characters` — нова колонка

| Колонка | Тип | Правило |
|---|---|---|
| `show_in_team` | boolean not null default false | змінює лише власник (наявна політика «свої персонажі») |

## `public.team_public` (подання, security definer, `grant select` anon / authenticated)

| Поле | Звідки |
|---|---|
| `member_id` | `md5(user_id::text)` — стабільний ключ без розкриття uuid |
| `real_name`, `about`, `sort` | `team_members` |
| `photo` | `team_members.photo_url`, порожньо — `profiles.avatar_url`, далі `''` |
| `characters` | `jsonb_agg({name, static_id}) order by created_at` з `characters where owner = user_id and show_in_team` |

## Функція `public.team_member_me() returns boolean` (security definer)

`exists (select 1 from team_members where user_id = auth.uid())` — щоб кабінет знав, чи показувати перемикач.
