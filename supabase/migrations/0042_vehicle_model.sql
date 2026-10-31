-- Q-Hub: код моделі транспорту в грі (configvehicle: urus, s1000rr…). За ним сайт бере фото з CDN гри;
-- порожньо — коду не знаємо. Один код — лише на одному записі каталогу. Файл можна запускати повторно.
alter table public.vehicles add column if not exists model text;
create unique index if not exists vehicles_model_key on public.vehicles (model) where model is not null;
