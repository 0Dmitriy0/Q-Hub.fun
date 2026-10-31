-- Транспорт: 3 справжні дублі (та сама машина під двома назвами) — один запис замість двох.
-- Лишається назва з маркетплейсу гри й код моделі; порожні поля доповнюються зі старого запису, старий видаляється.
-- Оцінок у старих записів немає (перевірено 31.10.2026). Запускати можна повторно.
with pair(keep, old, model) as (values
  ('Pfister Teycan', 'Pfister Taycanero', 'taycan'),
  ('Överflöd Age RS', 'Överflöd Age', 'agerars'),
  ('Bravado Charged II', 'Bravado Charged 1969', '69charger')
)
update public.vehicles k set
  model = p.model,
  price = case when k.price = 0 then o.price else k.price end,
  speed = coalesce(k.speed, o.speed), trunk = coalesce(k.trunk, o.trunk),
  tank = coalesce(k.tank, o.tank), seats = coalesce(k.seats, o.seats),
  real_name = case when k.real_name = '' then o.real_name else k.real_name end,
  min_level = coalesce(k.min_level, o.min_level), salon_price = coalesce(k.salon_price, o.salon_price),
  exclusive = k.exclusive or o.exclusive, vinyl = k.vinyl or o.vinyl,
  currency = case when k.salon_price is null then o.currency else k.currency end,
  fuel = case when o.fuel = 'electric' then o.fuel else k.fuel end
from pair p join public.vehicles o on o.name = p.old
where k.name = p.keep;

delete from public.vehicles where name in ('Pfister Taycanero', 'Överflöd Age', 'Bravado Charged 1969');

-- Перевірка: три записи з кодом, старих назв немає
select name, model, price, speed, exclusive, currency, salon_price from public.vehicles
where name in ('Pfister Teycan', 'Överflöd Age RS', 'Bravado Charged II', 'Pfister Taycanero', 'Överflöd Age', 'Bravado Charged 1969');
