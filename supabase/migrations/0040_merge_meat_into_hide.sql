-- Q-Hub: «М'ясо» — не окремий скупник, а частина «Шкур», як у грі (specs/003).
-- merge_buyer переносить товари, ціни, межі, історію, повідомлення гравців і невідомі назви до іншого скупника
-- оновленням buyer_id (без копій — тригери історії й позначки ціни не спрацьовують) і видаляє старого.
-- buyer_aliases + тригер price_reports_alias приймають ціни й таймер, що досі приходять зі старим id.
-- Файл можна запускати повторно: без «М'яса» merge_buyer нічого не робить.

-- ---------- псевдоніми: старий id скупника → теперішній ----------
create table if not exists public.buyer_aliases (
  alias text primary key,
  buyer_id text not null references public.buyers on delete cascade
);
alter table public.buyer_aliases enable row level security;
drop policy if exists "псевдоніми скупників читають усі" on public.buyer_aliases;
create policy "псевдоніми скупників читають усі" on public.buyer_aliases for select using (true);
-- писати — лише міграціям (через merge_buyer); клієнтам, і навіть admin з сайту, не потрібно
revoke all on public.buyer_aliases from anon, authenticated;
grant select on public.buyer_aliases to anon, authenticated;

-- ціна зі старим id → до теперішнього скупника. Тригери однієї події Postgres запускає за абеткою:
-- price_reports_alias іде перед price_reports_check, який шукає товар у buyer_items за buyer_id
create or replace function public.resolve_buyer_alias() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.buyer_id := coalesce((select buyer_id from public.buyer_aliases where alias = new.buyer_id), new.buyer_id);
  return new;
end $$;
drop trigger if exists price_reports_alias on public.price_reports;
create trigger price_reports_alias before insert on public.price_reports
  for each row execute function public.resolve_buyer_alias();

-- таймер наступної зміни: тіло з 0038 + псевдонім
create or replace function public.set_next_change(p_buyer text, p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare pr public.profiles;
begin
  if auth.uid() is null then raise exception 'Спершу увійди через Discord.'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if coalesce(btrim(pr.nick), '') = '' then raise exception 'Спершу вибери нік акаунта.'; end if;
  if not exists (select 1 from public.characters where owner = auth.uid() and static_id is not null) then
    raise exception 'Спершу додай персонажа зі статіком.';
  end if;
  if p_at <= now() or p_at > now() + interval '24 hours' then
    raise exception 'Час наступної зміни має бути в найближчі 24 години.';
  end if;
  p_buyer := coalesce((select buyer_id from public.buyer_aliases where alias = p_buyer), p_buyer);
  update public.buyers set next_change_at = p_at, next_change_by = auth.uid() where id = p_buyer;
  if not found then raise exception 'Немає такого скупника.'; end if;
end $$;
-- report_unknown_item псевдонім навмисно не розв'язує: стара програма, не знайшовши в каталозі жодного товару
-- «М'яса», вважала б невідомими всі його товари й засипала б адміну чергу в «Шкурах»

-- ---------- злиття ----------
create or replace function public.merge_buyer(p_from text, p_to text) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.buyers; t public.buyers;
begin
  select * into f from public.buyers where id = p_from;
  if not found then return; end if;   -- уже злито
  select * into t from public.buyers where id = p_to;
  if not found then raise exception 'Немає скупника %.', p_to; end if;

  -- товар, що вже є в обох: лишається рядок p_to (первинний ключ buyer_id, item_id); межі-підказки — з ним
  delete from public.buyer_items b where b.buyer_id = p_from
    and exists (select 1 from public.buyer_items x where x.buyer_id = p_to and x.item_id = b.item_id);
  -- лише buyer_id: тригери історії (update of price) і позначки ціни не спрацьовують;
  -- buyer_limit_reports переїде сам (FK на buyer_items з on update cascade, 0030)
  update public.buyer_items set buyer_id = p_to where buyer_id = p_from;

  -- історія: та сама точка в обох (лише для спільного товару) — одна
  delete from public.price_history h where h.buyer_id = p_from
    and exists (select 1 from public.price_history x where x.buyer_id = p_to and x.item_id = h.item_id and x.at = h.at and x.price = h.price);
  update public.price_history set buyer_id = p_to where buyer_id = p_from;

  -- повідомлення: усі до p_to — підтвердження «3 гравці за 48 год» рахує й ті, що до злиття
  delete from public.price_reports r where r.kind = 'buyer' and r.buyer_id = p_from and r.cycle is not null
    and exists (select 1 from public.price_reports x where x.kind = 'buyer' and x.buyer_id = p_to
                and x.reporter = r.reporter and x.item_id = r.item_id and x.cycle = r.cycle);
  update public.price_reports set buyer_id = p_to where buyer_id = p_from;

  -- невідомі назви (0029): та сама назва в обох — один рядок з сумою лічильників
  update public.buyer_unknown_items x set seen_count = x.seen_count + u.seen_count, last_seen = greatest(x.last_seen, u.last_seen)
    from public.buyer_unknown_items u
    where x.buyer_id = p_to and u.buyer_id = p_from and lower(x.text) = lower(u.text);
  delete from public.buyer_unknown_items u where u.buyer_id = p_from
    and exists (select 1 from public.buyer_unknown_items x where x.buyer_id = p_to and lower(x.text) = lower(u.text));
  update public.buyer_unknown_items set buyer_id = p_to where buyer_id = p_from;

  -- таймер: пізніший з двох, разом з тим, хто його поставив
  if f.next_change_at is not null and (t.next_change_at is null or f.next_change_at > t.next_change_at) then
    update public.buyers set next_change_at = f.next_change_at, next_change_by = f.next_change_by where id = p_to;
  end if;

  update public.buyer_aliases set buyer_id = p_to where buyer_id = p_from;
  insert into public.buyer_aliases (alias, buyer_id) values (p_from, p_to)
    on conflict (alias) do update set buyer_id = excluded.buyer_id;
  delete from public.buyers where id = p_from;
end $$;
revoke all on function public.merge_buyer(text, text) from public, anon, authenticated;

select public.merge_buyer('meat', 'hide');
