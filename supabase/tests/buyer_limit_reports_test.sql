-- «Перевір межі» (0030, specs/024 T031): гравець лише надсилає через функцію і лише ціну поза межами, повтор — один рядок;
-- читає й прибирає тільки admin. Запуск: supabase/tests/run.sh (після seed каталогу — товари скупника 'hide' є)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f3', '{"full_name":"LimUser"}'),
  ('00000000-0000-0000-0000-0000000000f4', '{"full_name":"LimAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000000f3';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000f4';

-- товар із межами 76–498, як «Молоток» на живій грі; другий — без меж
select set_config('test.it', (select item_id from public.buyer_items where buyer_id = 'hide' order by item_id limit 1)::text, false) as it,
       set_config('test.nolim', (select item_id from public.buyer_items where buyer_id = 'hide' order by item_id offset 1 limit 1)::text, false) as nolim \gset
select min_price as old_min, max_price as old_max from public.buyer_items where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint \gset
update public.buyer_items set min_price = 76, max_price = 498 where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint;
update public.buyer_items set min_price = 0, max_price = 0 where buyer_id = 'hide' and item_id = current_setting('test.nolim')::bigint;

-- гість: нічого не надсилає й не бачить
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  begin perform public.report_limit_mismatch('hide', current_setting('test.it')::bigint, 64); raise exception 'гість надіслав межі';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.buyer_limit_reports) = 0, 'гість бачить таблицю';
end $$;
reset role;

-- гравець: ціна поза межами двічі — рядок один, лічильник 2, ціна остання; в межах, без меж, чужий товар — ні
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f3', false) \gset
do $$ declare it bigint := current_setting('test.it')::bigint; begin
  perform public.report_limit_mismatch('hide', it, 64);
  perform public.report_limit_mismatch('hide', it, 60);
  begin perform public.report_limit_mismatch('hide', it, 200); raise exception 'ціна в межах пройшла';
  exception when invalid_parameter_value then null; end;
  begin perform public.report_limit_mismatch('hide', current_setting('test.nolim')::bigint, 64); raise exception 'товар без меж пройшов';
  exception when invalid_parameter_value then null; end;
  begin perform public.report_limit_mismatch('nope', it, 64); raise exception 'невідомий скупник пройшов';
  exception when invalid_parameter_value then null; end;
  begin perform public.report_limit_mismatch('hide', it, 0); raise exception 'нульова ціна пройшла';
  exception when invalid_parameter_value then null; end;
  assert (select count(*) from public.buyer_limit_reports) = 0, 'гравець читає таблицю';
  update public.buyer_limit_reports set seen_count = 100;
  delete from public.buyer_limit_reports;
  begin insert into public.buyer_limit_reports (buyer_id, item_id, price) values ('hide', it, 5); raise exception 'гравець вставив напряму';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.buyer_limit_reports) = 1, 'повтор дублює рядок';
  assert (select seen_count = 2 and price = 60 from public.buyer_limit_reports where buyer_id = 'hide'), 'лічильник не 2, ціна не остання або гравець їх змінив';
end $$;

-- адмін: бачить і прибирає
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f4', false) \gset
do $$ begin
  assert (select count(*) from public.buyer_limit_reports) = 1, 'адмін не бачить підказку';
  delete from public.buyer_limit_reports where buyer_id = 'hide';
  assert (select count(*) from public.buyer_limit_reports) = 0, 'адмін не прибрав підказку';
end $$;
reset role;

update public.buyer_items set min_price = :old_min, max_price = :old_max where buyer_id = 'hide' and item_id = current_setting('test.it')::bigint;
\echo '«Перевір межі» ok'
