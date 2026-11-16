-- Q-Hub: мітки «Роботи» й «Скупники» з коду сайту (src/data/mapPoints.ts) переїжджають у базу — адмін переносить
-- і видаляє їх як звичайні (напр. продавець фастфуду переїхав у Mirror Park). job_id — зв'язок мітки з роботою
-- довідника: кнопка «Мітка на мапі» у вікні роботи й опис роботи в мітці. Потрібна 0071.
-- Файл можна запускати повторно: точки з коду додаються один раз, поки в базі немає жодної мітки, перенесеної з коду.

alter table public.map_points add column if not exists job_id text references public.jobs (id) on delete set null on update cascade;
create index if not exists map_points_job on public.map_points (job_id) where job_id is not null;

-- мітки, які адмін уже поставив з іконкою роботи (напр. «Пілот» після 0071), — прив'язати до цієї роботи
update public.map_points m set job_id = j.id
  from public.jobs j
  where m.category_id = 'jobs' and m.job_id is null and m.icon = '/icons/jobs/' || j.id || '.svg';

-- точки з коду: автора немає (created_by is null) — так їх і впізнаємо при повторному запуску
do $$ begin
  if not exists (select 1 from public.map_points where category_id in ('jobs', 'buyers') and created_by is null) then
    insert into public.map_points (category_id, name, note, x, y, icon, job_id, created_by)
    select 'jobs', v.name, '', v.x, v.y, '/icons/jobs/' || v.job || '.svg', j.id, null
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
    ) v(job, name, x, y)
    left join public.jobs j on j.id = v.job;   -- роботу видалили з довідника — мітка лишається без зв'язку
    insert into public.map_points (category_id, name, note, x, y, icon, created_by) values
      ('buyers', 'Скупник мотлоху', '', -440.9, -1695.2, '/icons/junk/buyer.svg', null),
      ('buyers', 'Скупники штату', 'Врожай, гриби, дерево, метали, риба, шкури та інші', -1275.0, -1439.2, '/icons/harvest/buyer.svg', null);
  end if;
end $$;
