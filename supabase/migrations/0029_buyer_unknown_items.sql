-- Q-Hub: назви товарів, які програма бачить у вікні скупника, але яких немає в Q-Hub (specs/024, FR-010).
-- Лише пропозиції адміну: товар сам не додається (конституція, II). Зберігається розпізнаний текст, не знімок (III).
-- Гравець пише лише через report_unknown_item(); бачить і прибирає рядки тільки admin. Файл можна запускати повторно.
create table if not exists public.buyer_unknown_items (
  id bigint generated always as identity primary key,
  buyer_id text not null references public.buyers (id) on delete cascade on update cascade,
  text text not null check (char_length(text) between 4 and 80),
  seen_count integer not null default 1 check (seen_count >= 1),
  last_seen timestamptz not null default now(),
  reported_by uuid references auth.users on delete set null default auth.uid()
);
create unique index if not exists buyer_unknown_items_uniq on public.buyer_unknown_items (buyer_id, lower(text));

alter table public.buyer_unknown_items enable row level security;
drop policy if exists "buyer_unknown_items: admin read" on public.buyer_unknown_items;
drop policy if exists "buyer_unknown_items: admin delete" on public.buyer_unknown_items;
create policy "buyer_unknown_items: admin read" on public.buyer_unknown_items for select using (public.is_admin());
create policy "buyer_unknown_items: admin delete" on public.buyer_unknown_items for delete using (public.is_admin());

/* повтор тієї ж назви в того ж скупника — один рядок, лічильник росте */
create or replace function public.report_unknown_item(p_buyer text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then raise exception 'потрібен вхід' using errcode = '42501'; end if;
  if char_length(t) not between 4 and 80 then raise exception 'назва — 4–80 символів' using errcode = '22023'; end if;
  if not exists (select 1 from public.buyers where id = p_buyer) then raise exception 'немає такого скупника' using errcode = '22023'; end if;
  insert into public.buyer_unknown_items (buyer_id, text, reported_by) values (p_buyer, t, auth.uid())
    on conflict (buyer_id, lower(text)) do update set seen_count = buyer_unknown_items.seen_count + 1, last_seen = now();
end $$;

revoke all on function public.report_unknown_item(text, text) from public, anon;
grant execute on function public.report_unknown_item(text, text) to authenticated;
