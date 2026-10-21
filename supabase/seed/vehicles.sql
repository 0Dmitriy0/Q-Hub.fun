-- Q-Hub: каталог транспорту. Цей файл ти редагуєш сам і запускаєш у Supabase → SQL Editor.
-- Запускати можна скільки завгодно разів: транспорт з тією самою назвою не дублюється, а оновлюється.
--
-- ЯК ДОДАТИ ТРАНСПОРТ: скопіюй будь-який рядок у блоці нижче, зміни значення й постав кому
-- в кінці кожного рядка, КРІМ ОСТАННЬОГО (після останнього — нічого, далі йде дужка «) v(»).
--
-- Порядок значень у рядку:
--   ('тип', 'назва', 'марка', 'салон', держ_ціна, швидкість, багажник, бак, місць,
--    'реальна назва', мін_рівень, ціна_в_салоні, ексклюзив, вініли)
--   тип       — 'auto', 'moto' або 'avia' (саме так, латиницею, в лапках)
--   назва     — як у грі, в лапках; має бути унікальною (за нею оновлюється запис)
--   марка     — в лапках, можна '' якщо немає
--   салон     — в лапках: 'Люкс', 'Мото', 'Авіа' або ''
--   держ_ціна — держ. вартість, просто число без пробілів і без $ (7250000, а не 7 250 000 $); від неї рахується тюнінг
--   швидкість — км/год, число; якщо не знаєш — пиши null
--   багажник  — слотів, число або null
--   бак       — л, число або null
--   місць     — число або null
--   реальна назва — справжня модель, в лапках, наприклад 'Daewoo Lanos'; можна ''
--   мін_рівень    — мінімальний рівень для покупки, число або null
--   ціна_в_салоні — число; null, якщо в салоні не купити
--   ексклюзив     — true або false (true = «у салоні придбати неможливо»)
--   вініли        — true або false (підтримка вінілів)
-- Апостроф у назві пиши двічі: 'Ocelot''s' (інакше SQL зламається).

insert into public.vehicles (kind, name, brand, salon, price, speed, trunk, tank, seats, real_name, min_level, salon_price, exclusive, vinyl)
select kind, name, brand, salon, price, speed, trunk, tank, seats, real_name, min_level, salon_price, exclusive, vinyl from (values
  -- ⚠ Rune Lanes і Karin Priu — з твоїх скрінів; Pegassi Zentorno і Bati 801 — ПРИКЛАДИ з вигаданими числами, заміни або видали.
  ('auto', 'Rune Lanes',       'Rune',     '',     300000,  170, 20,  40,  null, 'Daewoo Lanos', 5,    300000,  false, false),
  ('auto', 'Karin Priu',       'Karin',    '',     150000,  190, 16,  50,  null, 'Toyota Prius', null, null,    true,  true),
  ('auto', 'Pegassi Zentorno', 'Pegassi',  'Люкс', 7250000, 340, 10,  70,  2,    '',             null, 7250000, false, false),
  ('moto', 'Bati 801',         'Pegassi',  'Мото', 150000,  230, 2,   15,  2,    '',             null, 150000,  false, false)
) v(kind, name, brand, salon, price, speed, trunk, tank, seats, real_name, min_level, salon_price, exclusive, vinyl)
on conflict (name) do update set
  kind = excluded.kind, brand = excluded.brand, salon = excluded.salon, price = excluded.price,
  speed = excluded.speed, trunk = excluded.trunk, tank = excluded.tank, seats = excluded.seats,
  real_name = excluded.real_name, min_level = excluded.min_level, salon_price = excluded.salon_price,
  exclusive = excluded.exclusive, vinyl = excluded.vinyl;

-- ВИДАЛИТИ транспорт (прибери «--» на початку рядка й впиши назву):
-- delete from public.vehicles where name = 'Karin Sultan';

-- Перевірка: скільки транспорту зараз у каталозі
select kind, count(*) from public.vehicles group by kind order by kind;
