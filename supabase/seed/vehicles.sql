-- Q-Hub: каталог транспорту. Цей файл ти редагуєш сам і запускаєш у Supabase → SQL Editor.
-- Запускати можна скільки завгодно разів: транспорт з тією самою назвою не дублюється, а оновлюється.
--
-- ЯК ДОДАТИ ТРАНСПОРТ: скопіюй будь-який рядок у блоці нижче, зміни значення й постав кому
-- в кінці кожного рядка, КРІМ ОСТАННЬОГО (після останнього — нічого, далі йде дужка «) v(»).
--
-- Порядок значень у рядку:
--   ('тип', 'назва', 'марка', 'салон', ціна, швидкість, багажник, бак, місць)
--   тип       — 'auto', 'moto' або 'avia' (саме так, латиницею, в лапках)
--   назва     — як у грі, в лапках; має бути унікальною (за нею оновлюється запис)
--   марка     — в лапках, можна '' якщо немає
--   салон     — в лапках: 'Люкс', 'Мото', 'Авіа' або ''
--   ціна      — держ. ціна, просто число без пробілів і без $ (7250000, а не 7 250 000 $)
--   швидкість — км/год, число; якщо не знаєш — пиши null
--   багажник  — кг, число або null
--   бак       — л, число або null
--   місць     — число або null
-- Апостроф у назві пиши двічі: 'Ocelot''s' (інакше SQL зламається).

insert into public.vehicles (kind, name, brand, salon, price, speed, trunk, tank, seats)
select kind, name, brand, salon, price, speed, trunk, tank, seats from (values
  -- ⚠ 4 рядки нижче — ПРИКЛАДИ, числа вигадані. Заміни їх на справжні з гри або видали.
  ('auto', 'Pegassi Zentorno', 'Pegassi',  'Люкс', 7250000, 340, 50,  70,  2),
  ('auto', 'Karin Sultan',     'Karin',    'Люкс', 120000,  210, 200, 60,  4),
  ('moto', 'Bati 801',         'Pegassi',  'Мото', 150000,  230, 5,   15,  2),
  ('avia', 'Frogger',          'Maibatsu', 'Авіа', 3900000, 260, 100, 300, 4)
) v(kind, name, brand, salon, price, speed, trunk, tank, seats)
on conflict (name) do update set
  kind = excluded.kind, brand = excluded.brand, salon = excluded.salon, price = excluded.price,
  speed = excluded.speed, trunk = excluded.trunk, tank = excluded.tank, seats = excluded.seats;

-- ВИДАЛИТИ транспорт (прибери «--» на початку рядка й впиши назву):
-- delete from public.vehicles where name = 'Karin Sultan';

-- Перевірка: скільки транспорту зараз у каталозі
select kind, count(*) from public.vehicles group by kind order by kind;
