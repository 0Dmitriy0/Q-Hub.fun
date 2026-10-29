-- Невідомі назви у скупників (0029, specs/024): гравець лише надсилає через функцію, повтор — один рядок;
-- читає й прибирає тільки admin. Запуск: supabase/tests/run.sh (після seed каталогу — скупник 'hide' є)
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', '{"full_name":"UnkUser"}'),
  ('00000000-0000-0000-0000-0000000000f2', '{"full_name":"UnkAdmin"}')
  on conflict (id) do nothing;
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000f2';

-- гість: нічого не надсилає й не бачить
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
do $$ begin
  begin perform public.report_unknown_item('hide', 'Шкура лося'); raise exception 'гість надіслав назву';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.buyer_unknown_items) = 0, 'гість бачить таблицю';
end $$;
reset role;

-- гравець: надсилає двічі — рядок один, лічильник 2; сам не бачить і не змінює
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false) \gset
do $$ begin
  perform public.report_unknown_item('hide', 'Шкура лося');
  perform public.report_unknown_item('hide', 'шкура лося');
  begin perform public.report_unknown_item('hide', 'abc'); raise exception 'коротка назва пройшла';
  exception when invalid_parameter_value then null; end;
  begin perform public.report_unknown_item('nope', 'Шкура лося'); raise exception 'невідомий скупник пройшов';
  exception when invalid_parameter_value then null; end;
  assert (select count(*) from public.buyer_unknown_items) = 0, 'гравець читає таблицю';
  update public.buyer_unknown_items set seen_count = 100;
  delete from public.buyer_unknown_items;
  begin insert into public.buyer_unknown_items (buyer_id, text) values ('hide', 'Пряма вставка'); raise exception 'гравець вставив напряму';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.buyer_unknown_items) = 1, 'повтор назви дублює рядок';
  assert (select seen_count from public.buyer_unknown_items where buyer_id = 'hide') = 2, 'лічильник повторів не 2 або гравець його змінив';
end $$;

-- адмін: бачить і прибирає
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false) \gset
do $$ begin
  assert (select count(*) from public.buyer_unknown_items) = 1, 'адмін не бачить назви';
  delete from public.buyer_unknown_items where buyer_id = 'hide';
  assert (select count(*) from public.buyer_unknown_items) = 0, 'адмін не прибрав назву';
end $$;
reset role;

\echo 'Невідомі назви у скупників ok'
