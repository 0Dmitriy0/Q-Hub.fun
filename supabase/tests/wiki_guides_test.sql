-- Гайди від гравців (0065): гравець пропонує новий гайд, правку чи прибирання; публікують лише moderator і admin (wiki_decide);
-- блоки й іконка — за білим списком, посилання — лише на сторінки сайту; автор нового гайду записується; повтор міграції не затирає правок.
-- Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a5', '{"full_name":"GuideWriter"}'),
  ('00000000-0000-0000-0000-0000000000a6', '{"full_name":"GuideMod"}'),
  ('00000000-0000-0000-0000-0000000000a7', '{"full_name":"GuideAdmin2"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000000a5';
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-0000000000a6';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a7';

do $$ begin
  assert (select count(*) from public.wiki_guides) >= 6, 'гайди не перенесено з src/data/guides.ts';
  assert (select name = 'Новачку: перші кроки' and icon = 'star' and jsonb_array_length(blocks) > 5 from public.wiki_guides where id = 'novachkam'), 'дані гайду «Новачку» не ті';
  assert public.wiki_guide_blocks_ok('[{"k":"p","text":"x"}]'), 'простий абзац не пройшов';
  assert not public.wiki_guide_blocks_ok('[]'), 'порожній гайд пройшов';
  assert not public.wiki_guide_blocks_ok('[{"k":"p","text":"  "}]'), 'порожній абзац пройшов';
  assert not public.wiki_guide_blocks_ok('[{"k":"p","text":"x","html":"<b>"}]'), 'зайве поле в блоці пройшло';
  assert not public.wiki_guide_blocks_ok('[{"k":"img","text":"x"}]'), 'невідомий тип блоку пройшов';
  assert not public.wiki_guide_blocks_ok('[{"k":"links","items":[{"to":"https://evil.example","label":"x"}]}]'), 'зовнішнє посилання пройшло';
  assert not public.wiki_guide_blocks_ok('[{"k":"links","items":[{"to":"//evil.example","label":"x"}]}]'), 'посилання //хост пройшло';
  assert public.wiki_guide_blocks_ok('[{"k":"links","items":[{"to":"/wiki/roboty?job=farmer","label":"Фермер"}]}]'), 'посилання на сайт не пройшло';
  assert not public.wiki_guide_blocks_ok('[{"k":"table","head":["a","b"],"rows":[["1"]]}]'), 'рядок таблиці не тієї довжини пройшов';
  assert public.wiki_guide_blocks_ok('[{"k":"table","head":["a","b"],"rows":[["1",""]]}]'), 'порожня клітинка таблиці не пройшла';
  assert not public.wiki_guide_blocks_ok('[{"k":"list","items":["a",""]}]'), 'порожній пункт списку пройшов';
  assert not public.wiki_guide_blocks_ok('[{"k":"list","items":["a"],"ordered":"так"}]'), 'ordered не булеве пройшло';
end $$;

-- ---------- гість ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  assert (select count(*) from public.wiki_guides where id = 'novachkam') = 1, 'гість не бачить гайдів';
  -- дані правильні: відмовити має право доступу (RLS), а не перевірка полів
  begin insert into public.wiki_proposals (section, kind, data, source) values ('guide', 'new',
      '{"id":"gist","name":"Гість","summary":"x","blocks":[{"k":"p","text":"x"}]}', 'own');
    raise exception 'гість подав гайд';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- гравець a5: пропонує, але не публікує ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false) \gset
insert into public.wiki_proposals (id, section, kind, data, source, source_note) values ('a5000000-0000-0000-0000-000000000001', 'guide', 'new',
  '{"id":"rybalka","name":"Рибалка з нуля","summary":"Де ловити й кому продавати","icon":"boat","blocks":[{"k":"h","text":"Вудка"},{"k":"list","items":["Купи вудку в 24/7","Наживка — там же"]},{"k":"links","items":[{"to":"/wiki/roboty?job=fisher","label":"Рибак"}]}]}',
  'own', 'ловлю щодня');
insert into public.wiki_proposals (id, section, target_id, kind, data, source) values ('a5000000-0000-0000-0000-000000000002', 'guide', 'novachkam', 'edit',
  '{"summary":"Промокод QHUB, перші квести й перша робота"}', 'game');
do $$ begin
  assert (select status = 'pending' and base_version = 1 from public.wiki_proposals where id = 'a5000000-0000-0000-0000-000000000002'), 'правка гайду не pending чи без версії';
  assert (select count(*) from public.wiki_guides where id = 'rybalka') = 0, 'гайд з''явився без рішення модератора';
  begin insert into public.wiki_proposals (section, kind, data, source) values ('guide', 'new',
      '{"id":"spam","name":"Заробіток","summary":"x","blocks":[{"k":"links","items":[{"to":"https://scam.example","label":"Тиць"}]}]}', 'own');
    raise exception 'гайд із зовнішнім посиланням прийнято';
  exception when sqlstate 'QH003' then null; end;
  begin insert into public.wiki_proposals (section, kind, data, source) values ('guide', 'new',
      '{"id":"ikonka","name":"Іконка","summary":"x","icon":"skull","blocks":[{"k":"p","text":"x"}]}', 'own');
    raise exception 'чужу іконку прийнято';
  exception when sqlstate 'QH003' then null; end;
  begin insert into public.wiki_proposals (section, kind, data, source) values ('guide', 'new', '{"id":"bez-tekstu","name":"Без тексту","summary":"x"}', 'own');
    raise exception 'гайд без тексту прийнято';
  exception when sqlstate 'QH003' then null; end;
  begin insert into public.wiki_proposals (section, target_id, kind, data, source) values ('guide', 'novachkam', 'edit', '{"sort":1}', 'own');
    raise exception 'порядок гайдів змінено пропозицією';
  exception when sqlstate 'QH003' then null; end;
  -- напряму — ні вставити, ні змінити
  begin insert into public.wiki_guides (id, name, blocks) values ('napriamu', 'Напряму', '[{"k":"p","text":"x"}]');
    raise exception 'гравець вставив гайд напряму';
  exception when insufficient_privilege then null; end;
  update public.wiki_guides set name = 'Вандалізм' where id = 'novachkam';
  assert (select name from public.wiki_guides where id = 'novachkam') = 'Новачку: перші кроки', 'гравець змінив гайд напряму';
  begin perform public.wiki_decide('a5000000-0000-0000-0000-000000000001', 'accept'); raise exception 'гравець опублікував гайд';
  exception when sqlstate 'QH010' then null; end;
end $$;
reset role;

-- ---------- moderator a6: публікує новий гайд і правку, ловить дубль, ховає й повертає ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a6', false) \gset
do $$ declare r jsonb; begin
  r := public.wiki_decide('a5000000-0000-0000-0000-000000000001', 'accept');
  assert r ->> 'status' = 'accepted' and r ->> 'target_id' = 'rybalka', 'новий гайд не опубліковано';
  assert (select name = 'Рибалка з нуля' and icon = 'boat' and version = 1 and created_by = '00000000-0000-0000-0000-0000000000a5' and sort = 1000
    from public.wiki_guides where id = 'rybalka'), 'новий гайд не той або без автора';
  assert (select count(*) from public.wiki_versions where section = 'guide' and target_id = 'rybalka') = 1, 'немає версії нового гайду';

  r := public.wiki_decide('a5000000-0000-0000-0000-000000000002', 'accept');
  assert (select summary = 'Промокод QHUB, перші квести й перша робота' and version = 2 and updated_by = '00000000-0000-0000-0000-0000000000a5'
    and jsonb_array_length(blocks) > 5 from public.wiki_guides where id = 'novachkam'), 'правку не застосовано або текст гайду зник';
  assert (select count(*) from public.wiki_versions where section = 'guide' and target_id = 'novachkam') = 2, 'історія: немає початкової версії і правки';
end $$;
reset role;

-- дубль назви: гравець подав, модератор не може опублікувати
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false) \gset
insert into public.wiki_proposals (id, section, kind, data, source) values ('a5000000-0000-0000-0000-000000000003', 'guide', 'new',
  '{"id":"rybalka-2","name":"рибалка з нуля","summary":"Те саме","blocks":[{"k":"p","text":"Дубль"}]}', 'own');
insert into public.wiki_proposals (id, section, target_id, kind, data, source, source_note) values ('a5000000-0000-0000-0000-000000000004', 'guide', 'rybalka', 'hide', '{}', 'own', 'застарів');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a6', false) \gset
do $$ declare r jsonb; begin
  begin perform public.wiki_decide('a5000000-0000-0000-0000-000000000003', 'accept'); raise exception 'дубль назви опубліковано';
  exception when sqlstate 'QH003' then null; end;
  r := public.wiki_decide('a5000000-0000-0000-0000-000000000004', 'accept');
  assert (select hidden from public.wiki_guides where id = 'rybalka'), 'гайд не сховано';
  assert (select count(*) from public.wiki_guides where id = 'rybalka') = 1, 'модератор не бачить схований гайд';
end $$;
reset role;

set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin assert (select count(*) from public.wiki_guides where id = 'rybalka') = 0, 'гість бачить схований гайд'; end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a6', false) \gset
do $$ begin
  perform public.wiki_unhide('guide', 'rybalka', 'помилково');
  assert (select not hidden from public.wiki_guides where id = 'rybalka'), 'гайд не повернуто';
  -- відкат правки «Новачку» до першої версії
  perform public.wiki_revert('guide', 'novachkam', 1, 'перевірка відкату');
  assert (select summary <> 'Промокод QHUB, перші квести й перша робота' and version = 3 from public.wiki_guides where id = 'novachkam'), 'відкат не спрацював';
  -- напряму модератор теж не пише
  update public.wiki_guides set sort = 1 where id = 'rybalka';
  assert (select sort from public.wiki_guides where id = 'rybalka') = 1000, 'модератор змінив гайд напряму';
end $$;
reset role;

-- ---------- admin: напряму можна (порядок), але check блоків стоїть і для нього ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a7', false) \gset
do $$ begin
  update public.wiki_guides set sort = 5 where id = 'rybalka';
  assert (select sort from public.wiki_guides where id = 'rybalka') = 5, 'admin не змінив порядок';
  begin update public.wiki_guides set blocks = '[{"k":"links","items":[{"to":"https://x.example","label":"x"}]}]' where id = 'rybalka';
    raise exception 'admin записав зовнішнє посилання';
  exception when check_violation then null; end;
end $$;
reset role;

-- повтор міграції не затирає правок гравців
\i supabase/migrations/0065_wiki_guides.sql
do $$ begin
  assert (select version = 3 from public.wiki_guides where id = 'novachkam'), 'повтор міграції затер гайд';
  assert (select count(*) from public.wiki_guides where id = 'rybalka') = 1, 'повтор міграції прибрав гайд гравця';
end $$;
select 'wiki_guides ok';
