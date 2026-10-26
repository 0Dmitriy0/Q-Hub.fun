-- Q-Hub: човни в каталозі транспорту — новий тип 'boat' (на маркетплейсі гри «Салон човнів»).
-- Файл можна запускати повторно.
alter table public.vehicles drop constraint if exists vehicles_kind_check;
alter table public.vehicles add constraint vehicles_kind_check check (kind in ('auto', 'moto', 'avia', 'boat'));
