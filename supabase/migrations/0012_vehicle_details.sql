-- Q-Hub: подробиці транспорту для вікна «як у грі»: реальна назва, мінімальний рівень,
-- вартість у салоні (порожньо — ексклюзив, у салоні не купити), підтримка вінілів.
-- price — держ. вартість, від неї рахується тюнінг; trunk — багажник у слотах.
alter table public.vehicles
  add column if not exists real_name text not null default '',
  add column if not exists min_level integer check (min_level is null or min_level >= 0),
  add column if not exists salon_price bigint check (salon_price is null or salon_price >= 0),
  add column if not exists exclusive boolean not null default false,
  add column if not exists vinyl boolean not null default false;
