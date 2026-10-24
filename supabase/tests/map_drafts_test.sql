-- Чернетки міток (0019): подають editor/moderator/admin лише від себе; бачать свої (admin — усі);
-- публікує й відхиляє тільки admin, один раз; знімки бачать admin і автор. Запуск: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- a — editor (після map_test.sql), b — user; свої c1 — moderator, d1 — admin (c і d уже зайняті іншими тестами)
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', '{"full_name":"Moder"}'),
  ('00000000-0000-0000-0000-0000000000d1', '{"full_name":"Admin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'editor' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d1';
insert into public.map_categories (id, name) values ('drafts-test', 'Тест чернеток') on conflict (id) do nothing;

-- ---------- гість ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  begin insert into public.map_drafts (id, taken_at, shot) values ('10000000-0000-0000-0000-000000000000', now(), 'x/x.jpg'); raise exception 'гість подав чернетку';
  exception when insufficient_privilege then null; end;
  begin perform public.publish_map_draft('10000000-0000-0000-0000-000000000000', 'drafts-test', 0, 0); raise exception 'гість викликав публікацію';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- editor a: подає свої ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
insert into public.map_drafts (id, taken_at, shot, x, y, match)
  values ('a0000000-0000-0000-0000-000000000001', now(), '00000000-0000-0000-0000-00000000000a/a0000000-0000-0000-0000-000000000001.jpg', 100, 200, '{"score":0.5}');
insert into public.map_drafts (id, taken_at, shot)   -- «точку не визначено»
  values ('a0000000-0000-0000-0000-000000000002', now(), '00000000-0000-0000-0000-00000000000a/a0000000-0000-0000-0000-000000000002.jpg');
insert into storage.objects (bucket_id, name, owner) values ('map-drafts', '00000000-0000-0000-0000-00000000000a/a0000000-0000-0000-0000-000000000001.jpg', auth.uid());
do $$ begin
  assert (select author from public.map_drafts where id = 'a0000000-0000-0000-0000-000000000001') = auth.uid(), 'автор не записався';
  assert (select status from public.map_drafts where id = 'a0000000-0000-0000-0000-000000000001') = 'new', 'статус не new';
  -- повторна відправка з програми — не дубль
  begin insert into public.map_drafts (id, taken_at, shot) values ('a0000000-0000-0000-0000-000000000001', now(), 'a/x.jpg'); raise exception 'дубль прийнято';
  exception when unique_violation then null; end;
  begin insert into public.map_drafts (id, author, taken_at, shot) values ('a0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000c1', now(), 'c/x.jpg'); raise exception 'чернетку від чужого імені прийнято';
  exception when insufficient_privilege then null; end;
  begin insert into public.map_drafts (id, taken_at, shot, status, reviewed_at) values ('a0000000-0000-0000-0000-000000000008', now(), 'a/x.jpg', 'rejected', now()); raise exception 'одразу оброблену чернетку прийнято';
  exception when insufficient_privilege then null; end;
  begin insert into public.map_drafts (id, taken_at, shot, x) values ('a0000000-0000-0000-0000-000000000007', now(), 'a/x.jpg', 5); raise exception 'x без y прийнято';
  exception when check_violation then null; end;
  begin insert into public.map_drafts (id, taken_at, shot, x, y) values ('a0000000-0000-0000-0000-000000000006', now(), 'a/x.jpg', 99999, 0); raise exception 'точку поза мапою прийнято';
  exception when check_violation then null; end;
  begin insert into public.map_drafts (id, taken_at, shot) values ('a0000000-0000-0000-0000-000000000005', now() + interval '1 day', 'a/x.jpg'); raise exception 'час з майбутнього прийнято';
  exception when check_violation then null; end;
  -- знімок лише у свою теку
  begin insert into storage.objects (bucket_id, name, owner) values ('map-drafts', '00000000-0000-0000-0000-0000000000c1/x.jpg', auth.uid()); raise exception 'знімок у чужу теку прийнято';
  exception when insufficient_privilege then null; end;
  -- змінити чи видалити свою чернетку не можна: оброблення лише через адміна
  update public.map_drafts set status = 'published' where id = 'a0000000-0000-0000-0000-000000000001';
  delete from public.map_drafts where id = 'a0000000-0000-0000-0000-000000000002';
  assert (select count(*) from public.map_drafts where status = 'new') = 2, 'editor змінив або видалив чернетку';
  begin perform public.publish_map_draft('a0000000-0000-0000-0000-000000000001', 'drafts-test', 1, 1); raise exception 'editor опублікував';
  exception when raise_exception then if sqlerrm <> 'not_admin' then raise; end if; end;
  begin perform public.reject_map_draft('a0000000-0000-0000-0000-000000000001'); raise exception 'editor відхилив';
  exception when raise_exception then if sqlerrm <> 'not_admin' then raise; end if; end;
  -- права на мапу не розширились
  begin insert into public.map_points (category_id, x, y) values ('drafts-test', 0, 0); raise exception 'editor додав мітку напряму';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- moderator c: подає свою, бачить лише свою ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false) \gset
insert into public.map_drafts (id, taken_at, shot, x, y)
  values ('c0000000-0000-0000-0000-000000000001', now(), '00000000-0000-0000-0000-0000000000c1/c0000000-0000-0000-0000-000000000001.jpg', 110, 210);
do $$ begin
  assert (select count(*) from public.map_drafts) = 1, 'moderator бачить чужі чернетки';
  assert (select count(*) from storage.objects where bucket_id = 'map-drafts') = 0, 'moderator бачить чужий знімок';
  begin perform public.publish_map_draft('c0000000-0000-0000-0000-000000000001', 'drafts-test', 1, 1); raise exception 'moderator опублікував';
  exception when raise_exception then if sqlerrm <> 'not_admin' then raise; end if; end;
end $$;
reset role;

-- ---------- user b: нічого ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \gset
do $$ begin
  assert (select count(*) from public.map_drafts) = 0, 'гравець бачить чернетки';
  assert (select count(*) from storage.objects where bucket_id = 'map-drafts') = 0, 'гравець бачить знімки чернеток';
  begin insert into public.map_drafts (id, taken_at, shot) values ('b0000000-0000-0000-0000-000000000001', now(), '00000000-0000-0000-0000-00000000000b/x.jpg'); raise exception 'гравець подав чернетку';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name, owner) values ('map-drafts', '00000000-0000-0000-0000-00000000000b/x.jpg', auth.uid()); raise exception 'гравець завантажив знімок чернетки';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- admin d: бачить усе, публікує й відхиляє один раз ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false) \gset
do $$
declare pid bigint;
begin
  assert (select count(*) from public.map_drafts) = 3, 'адмін бачить не всі чернетки';
  assert (select count(*) from storage.objects where bucket_id = 'map-drafts') = 1, 'адмін не бачить знімка';
  begin perform public.publish_map_draft('a0000000-0000-0000-0000-000000000002', '', 1, 1); raise exception 'публікацію без категорії прийнято';
  exception when raise_exception then if sqlerrm <> 'no_category' then raise; end if; end;
  begin perform public.publish_map_draft('a0000000-0000-0000-0000-000000000002', 'drafts-test', null, null); raise exception 'публікацію без точки прийнято';
  exception when raise_exception then if sqlerrm <> 'no_point' then raise; end if; end;

  pid := public.publish_map_draft('a0000000-0000-0000-0000-000000000001', 'drafts-test', 101.5, 199, 'Бак', 'біля пірсу');
  assert (select x = 101.5 and y = 199 and name = 'Бак' and note = 'біля пірсу' and created_by = auth.uid() from public.map_points where id = pid), 'мітка не та';
  assert (select status = 'published' and point_id = pid and reviewed_by = auth.uid() and reviewed_at is not null and x = 101.5
    from public.map_drafts where id = 'a0000000-0000-0000-0000-000000000001'), 'чернетку не позначено опублікованою';
  -- друга вкладка / подвійний клік
  begin perform public.publish_map_draft('a0000000-0000-0000-0000-000000000001', 'drafts-test', 1, 1); raise exception 'опубліковано двічі';
  exception when raise_exception then if sqlerrm <> 'already_processed' then raise; end if; end;
  begin perform public.reject_map_draft('a0000000-0000-0000-0000-000000000001'); raise exception 'опубліковану відхилено';
  exception when raise_exception then if sqlerrm <> 'already_processed' then raise; end if; end;
  assert (select count(*) from public.map_points where category_id = 'drafts-test') = 1, 'мітка задвоїлась';

  perform public.reject_map_draft('c0000000-0000-0000-0000-000000000001');
  assert (select status from public.map_drafts where id = 'c0000000-0000-0000-0000-000000000001') = 'rejected', 'не відхилено';
  begin perform public.reject_map_draft('c0000000-0000-0000-0000-000000000001'); raise exception 'відхилено двічі';
  exception when raise_exception then if sqlerrm <> 'already_processed' then raise; end if; end;

  -- знімки свіжих оброблених не позначаються видаленими
  assert public.mark_map_draft_shots_deleted(array['a0000000-0000-0000-0000-000000000001'::uuid]) = 0, 'свіжий знімок позначено видаленим';
end $$;
reset role;

-- оброблену 31 день тому — можна; нову — ніколи
update public.map_drafts set reviewed_at = now() - interval '31 days' where id = 'c0000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false) \gset
do $$ begin
  assert public.mark_map_draft_shots_deleted(array['c0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000002'::uuid]) = 1, 'позначено не те';
  assert (select shot_deleted_at is not null from public.map_drafts where id = 'c0000000-0000-0000-0000-000000000001'), 'позначки немає';
  delete from storage.objects where bucket_id = 'map-drafts';
  assert (select count(*) from storage.objects where bucket_id = 'map-drafts') = 0, 'адмін не видалив знімок';
end $$;
reset role;

-- видалили мітку — чернетка лишається опублікованою, без посилання
delete from public.map_points where category_id = 'drafts-test';
do $$ begin
  assert (select status = 'published' and point_id is null from public.map_drafts where id = 'a0000000-0000-0000-0000-000000000001'), 'чернетка зламалась після видалення мітки';
end $$;
delete from public.map_drafts; delete from public.map_categories where id = 'drafts-test';
\echo 'Чернетки міток ok: гість і гравець нічого не бачать і не подають; editor і moderator подають лише свої й бачать лише свої; дубль, чужий автор, x без y, поза мапою — відхилено; публікує й відхиляє лише адмін, один раз; знімки — лише адмін і автор'
