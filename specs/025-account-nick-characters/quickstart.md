# Quickstart: перевірка ніка акаунта й персонажів

## Один раз (власник)

1. Міграція `0038_account_nick_characters.sql` — у SQL Editor Supabase (як і попередні).
2. Злиття в `main` → GitHub Actions збирає сайт і програму.
3. Функції Supabase не змінюються — деплой не потрібен.

## Автоматично

```text
npx.cmd tsc --noEmit
npx.cmd vitest run                         # сайт: нік, CharacterPick, updates без статіку
cd desktop && npm.cmd test                 # parseNick, parseCharacter
bash supabase/tests/run.sh                 # account_nick_test.sql — у CI (Linux), локально на Windows не запускається
```

## Вручну (програма: `cd desktop && npm.cmd start`)

| # | Дія | Очікування |
|---|---|---|
| 1 | Увійти акаунтом без ніка | форма «Нік у Q-Hub»; `d vyrx` — відмова; `D_VYRX` — далі |
| 2 | Додати «Dmitriy_Core», свій статік | плитка «Dmitriy_Core #статік» |
| 3 | Додати «Jacson_Coreee», інший статік | дві плитки; статік першого не змінився (SC-001) |
| 4 | Додати персонажа зі статіком першого | «Статік … уже має інший персонаж» |
| 5 | Відкрити плашку | шапка: «D_VYRX», під ним «Jacson_Coreee #…» |
| 6 | Відкрити скупника в грі («зір») | ціни на сайті: «D_VYRX · Jacson_Coreee», без статіку |
| 7 | Вписати ціну вручну в кабінеті | діалог вибору персонажа; «Скасувати» — нічого не записано |
| 8 | Змінити нік двічі поспіль | друга спроба — «можна знову з …» |
| 9 | Видалити «Jacson_Coreee» | ціни з нього лишились на сайті під ніком |

## Перенесення (на копії даних або після міграції)

- акаунт зі статіком у профілі й персонажем з тим самим ім'ям → статік у персонажа (SC-004);
- старі ціни — у рейтингу під ніком, щойно гравець його вибере.

Перевірка після міграції — у Supabase → SQL Editor (усі три мають дати 0 рядків, крім пояснених):

```sql
-- 1. профільний статік, який не перейшов жодному персонажу (акаунт без персонажів — пояснено: перейде, коли гравець
--    створить персонажа з цим самим статіком)
select p.id, p.name, p.static_id, (select count(*) from public.characters c where c.owner = p.id) as chars
from public.profiles p
where p.static_id is not null and not exists (select 1 from public.characters c where c.static_id = p.static_id);

-- 2. ціни гравців без персонажа (лише акаунти без жодного персонажа — пояснено)
select r.reporter, count(*) from public.price_reports r where r.character_id is null group by r.reporter;

-- 3. скільки акаунтів ще не вибрали нік (не помилка: виберуть при наступному вході)
select count(*) as без_ніка from public.profiles where nick is null;
```

Локально (Windows, без psql і Docker) SQL-тести проганялись у PGlite 0.2.17 — копія `supabase/tests/run.sh` на Node;
відома відмінність від справжнього Postgres: перевірка сиду міток QuantFun (2149 шт.) там дає 0 рядків, у CI — ні.
