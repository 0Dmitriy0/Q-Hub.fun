-- Q-Hub: у вбудовані категорії «Роботи» й «Скупники» адмін ставить мітки з бази — нова робота на проєкті
-- (напр. «Пілот») чи новий скупник з'являється на мапі без зміни коду сайту.
-- Ці категорії сайт малює сам (src/lib/mapMarks.ts, BUILTIN): рядки нижче потрібні лише для зв'язку
-- map_points.category_id, назву, іконку й колір сайт бере з коду.
-- Читання цих двох рядків закрите для всіх (і для адміна), щоб старі версії сайту й програми не показували
-- «Роботи» й «Скупники» двічі; перевірка зв'язку мітки з категорією RLS не враховує, а функції довідника
-- (security definer) їх бачать. Пишуть, як і раніше, лише admin. Файл можна запускати повторно.

insert into public.map_categories (id, name, grp, icon, color, sort, shown) values
  ('jobs', 'Роботи', 'Заробіток', '/icons/map/jobs.svg', '#ff6a1f', 52, true),
  ('buyers', 'Скупники', 'Заробіток', '/icons/harvest/buyer.svg', '#f5b301', 53, true)
on conflict (id) do nothing;

drop policy if exists "map_categories: read all" on public.map_categories;
drop policy if exists "map_categories: admin write" on public.map_categories;
drop policy if exists "map_categories: admin insert" on public.map_categories;
drop policy if exists "map_categories: admin update" on public.map_categories;
drop policy if exists "map_categories: admin delete" on public.map_categories;
create policy "map_categories: read all" on public.map_categories for select using (id not in ('jobs', 'buyers'));
create policy "map_categories: admin insert" on public.map_categories for insert with check (public.is_admin());
create policy "map_categories: admin update" on public.map_categories for update using (public.is_admin()) with check (public.is_admin());
create policy "map_categories: admin delete" on public.map_categories for delete using (public.is_admin());
