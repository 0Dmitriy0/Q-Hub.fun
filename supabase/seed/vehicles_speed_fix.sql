-- Максимальна швидкість з configvehicle (файли розробників гри, 31.10.2026): файл головніший за вписане вручну (рішення
-- власника 31.10). Лише розбіжні записи; швидкість 0 у файлі (мото) — не дані, не чіпається. За кодом моделі (0042).
-- Запускати можна повторно.
update public.vehicles v set speed = x.speed
from (values
  ('21camaro', 300),   -- Declasse Camars ZL1: було 270
  ('a45amg', 230),   -- Benefactor A45 W176: було 240
  ('bmwi8', 350),   -- Übermacht I8: було 260
  ('camaro69', 220),   -- Declasse Camars 1969: було 180
  ('cayenne24', 300),   -- Pfister Cayen: було 280
  ('divo18', 400),   -- Truffade Div: було 380
  ('ecto1', 240),   -- Albany Ectomobile-1: було 250
  ('escalade', 230),   -- Albany Escalader: було 250
  ('mc20h', 330),   -- Lampadati MC20: було 325
  ('starone', 300),   -- Vulcar Star One: було 320
  ('subwrx', 230),   -- Karin Impresa IV: було 250
  ('x3g03', 280)   -- Übermacht F95: було 300
) x(model, speed)
where lower(v.model) = x.model;
