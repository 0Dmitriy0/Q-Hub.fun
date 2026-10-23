-- Q-Hub: тип двигуна транспорту — на пальному чи електро (для позначки на плитці й фільтра).
alter table public.vehicles add column if not exists fuel text not null default 'petrol'
  check (fuel in ('petrol', 'electric'));
