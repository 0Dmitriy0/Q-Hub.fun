-- Q-Hub: за яку валюту транспорт купується в салоні — ігрові долари чи донатна валюта.
-- Для донатного транспорту salon_price — це сума в донатній валюті; держ. вартість (price) може бути невідома.
alter table public.vehicles add column if not exists currency text not null default 'game'
  check (currency in ('game', 'donate'));
