-- Q-Hub: дати й опис івентів (specs/018). Категорія мапи (напр. «Гарбузи» в папці «Івенти») має короткий опис і дати
-- початку й кінця — у фільтрах під назвою: «з 23.10 до 12.11». Дату кінця можна не вказувати — і в категорії,
-- і в сезонному івенті на головній: тоді він триває, доки адмін його не прибере. Файл можна запускати повторно.
alter table public.map_categories add column if not exists description text not null default '' check (char_length(description) <= 300);
alter table public.map_categories add column if not exists starts_on date;
alter table public.map_categories add column if not exists ends_on date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'map_categories_dates') then
    alter table public.map_categories add constraint map_categories_dates check (ends_on is null or starts_on is null or ends_on >= starts_on);
  end if;
end $$;

-- сезонний івент без дати кінця; check (ends_on >= starts_on) з 0025 null пропускає
alter table public.season_events alter column ends_on drop not null;
