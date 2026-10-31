-- Q-Hub: дизель і український номер у транспорту (configvehicle від розробників гри, 31.10.2026).
-- • fuel: + 'diesel' (fuelType = 3: Touareg, Transporter T6, V250, X5 E53…). Електро — окреме поле CSV electric, а не fuelType:
--   електромобілі там мають fuelType 0, як і звичайні авто.
-- • ua_plate: uaType — чи можна поставити український номер (1 — так, 0 — ні); null — не знаємо.
-- Значення заливає supabase/seed/vehicles_fuel_ua.sql за кодом моделі. Файл можна запускати повторно.
alter table public.vehicles drop constraint if exists vehicles_fuel_check;
alter table public.vehicles add constraint vehicles_fuel_check check (fuel in ('petrol', 'diesel', 'electric'));
alter table public.vehicles add column if not exists ua_plate boolean;
