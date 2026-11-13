-- Q-Hub: після оновлення гри апарати з водою та з їжею стали одним видом — «Вендингові апарати».
-- Категорію 'water' перейменовуємо на 'vending' (FK з on update cascade переносять мітки, зони, чернетки, пакети, івенти),
-- мітки 'food' переносимо туди ж, категорію 'food' видаляємо. Мітки не видаляються: обидва апарати в парах досі стоять.
-- Назви міток: «Апарат з водою №N» / «Апарат з їжею №N» → «Вендинговий апарат №N».
-- Файл можна запускати повторно.

do $$
begin
  if exists (select 1 from public.map_categories where id = 'water')
     and not exists (select 1 from public.map_categories where id = 'vending') then
    update public.map_categories set id = 'vending' where id = 'water';
  end if;

  if not exists (select 1 from public.map_categories where id = 'vending') then
    insert into public.map_categories (id, name, grp, icon, color, sort, shown)
    values ('vending', 'Вендингові апарати', 'Вендингові апарати', '/icons/junk/mineral-water.svg', '#a7d7f5', 60, false);
  end if;
end $$;

update public.map_categories set name = 'Вендингові апарати', grp = 'Вендингові апарати' where id = 'vending';

update public.map_points  set category_id = 'vending' where category_id = 'food';
update public.map_areas   set category_id = 'vending' where category_id = 'food';
update public.map_batches set category_id = 'vending' where category_id = 'food';
update public.map_drafts  set category_id = 'vending' where category_id = 'food';
insert into public.season_event_maps (event_id, category_id)
  select event_id, 'vending' from public.season_event_maps where category_id = 'food'
  on conflict do nothing;

-- пропозиції довідника, що ще чекають розгляду, — на нову категорію (інакше wiki_decide не знайде 'food'/'water')
update public.wiki_proposals
  set data = jsonb_set(data, '{category_id}', '"vending"')
  where section = 'map_point' and status in ('pending', 'conflict') and data ->> 'category_id' in ('water', 'food');

delete from public.map_categories where id = 'food';

update public.map_points
  set name = regexp_replace(name, '^Апарат з (водою|їжею)', 'Вендинговий апарат')
  where category_id = 'vending' and name ~ '^Апарат з (водою|їжею)';
