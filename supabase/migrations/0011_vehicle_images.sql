-- Q-Hub: фото транспорту, як і інші картинки каталогу, ставить лише адмін
-- (файли — у тому ж сховищі catalog у папці vehicles/, право на нього вже лише в адміна).
drop trigger if exists vehicles_image_guard on public.vehicles;
create trigger vehicles_image_guard before update of image_url on public.vehicles
  for each row execute function public.guard_image_url();
