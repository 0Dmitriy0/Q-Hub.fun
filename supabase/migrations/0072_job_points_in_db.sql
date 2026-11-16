-- Q-Hub: мітки робіт і скупників, що були зашиті в код сайту (src/data/mapPoints.ts), переїжджають у базу —
-- тепер адмін їх змінює, переносить і видаляє так само, як будь-яку іншу мітку.
-- map_points.job_id — зв'язок мітки з роботою довідника: кнопка «Мітка на мапі» в описі роботи й «Опис роботи»
-- на мітці. Виставляє адмін у вікні роботи або у формі мітки.
-- Спершу має бути застосована 0071 (рядки «jobs»/«buyers» у map_categories).
-- Файл можна запускати повторно: мітки додаються лише разом з колонкою, тож видалена адміном мітка не повернеться.

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'map_points' and column_name = 'job_id') then
    alter table public.map_points add column job_id text references public.jobs (id) on update cascade on delete set null;

    -- мітки робіт, які адмін уже поставив з бази (0071): робота — за іконкою /icons/jobs/<id>.svg
    update public.map_points p set job_id = j.id
      from public.jobs j
      where p.category_id = 'jobs' and p.icon = '/icons/jobs/' || j.id || '.svg';

    insert into public.map_points (category_id, name, note, x, y, icon, job_id)
    select 'jobs', v.name,
      coalesce(case when j.legal then 'Легальна' else 'Нелегальна' end || ' · з ' || j.level || ' рівня', ''),
      v.x, v.y, '/icons/jobs/' || v.job || '.svg', j.id
    from (values
      ('trucker', 'Далекобійник', 921.8, -3243.1),
      ('akvanavt', 'Акванавт', 16.8, -2803.0),
      ('forklift', 'Водій навантажувача', -419.5, -2763.4),
      ('garbage', 'Сміттяр', -618.9, -1623.8),
      ('courier', 'Кур''єр', -1183.8, -1535.9),
      ('postman', 'Поштар', 138.8, 102.1),
      ('bus', 'Водій автобуса', -301.3, -922.1),
      ('mechanic', 'Механік', -435.4, -2174.4),
      ('taxi', 'Таксі', 892.7, -178.1),
      ('grocery', 'Розвізник продуктів', 2709.8, 3455.5),
      ('electrician', 'Електрик', 727.3, 130.1),
      ('detective', 'Детектив', 227.8, -382.0),
      ('inkasator', 'Інкасатор', 252.5, 209.8),
      ('carthief', 'Автовикрадач', 190.4, -2224.9),
      ('burglar', 'Крадій-домушник', 1425.7, 6335.3),
      ('firefighter', 'Пожежник', -376.6, 6121.6),
      ('lawnmower', 'Газонокосильник', -1327.8, 47.1),
      ('fastfood', 'Продавець фастфуду', 158.0, -1447.4)
    ) as v (job, name, x, y)
    left join public.jobs j on j.id = v.job
    where not exists (select 1 from public.map_points p where p.category_id = 'jobs' and p.job_id = v.job);

    insert into public.map_points (category_id, name, note, x, y, icon) values
      ('buyers', 'Скупник мотлоху', '', -440.9, -1695.2, '/icons/junk/buyer.svg'),
      ('buyers', 'Скупники штату', 'Врожай, гриби, дерево, метали, риба, шкури та інші', -1275.0, -1439.2, null);
  end if;
end $$;

create index if not exists map_points_job_id on public.map_points (job_id) where job_id is not null;
