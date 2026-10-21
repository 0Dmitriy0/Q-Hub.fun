-- Q-Hub: час наступної зміни цін у кожного скупника. Скупники міняють ціни в різний час,
-- тож гравець вписує той час, який бачить у грі; сайт показує відлік і хто вписав.
alter table public.buyers
  add column if not exists next_change_at timestamptz,
  add column if not exists next_change_by uuid references public.profiles (id) on delete set null;

-- вписати може будь-який гравець із ніком і статіком; лише час у найближчі 24 години
create or replace function public.set_next_change(p_buyer text, p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare pr public.profiles;
begin
  if auth.uid() is null then raise exception 'Спершу увійди через Discord.'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.static_id is null or coalesce(btrim(pr.game_name), '') = '' then
    raise exception 'Спершу вкажи нік персонажа і статік у профілі.';
  end if;
  if p_at <= now() or p_at > now() + interval '24 hours' then
    raise exception 'Час наступної зміни має бути в найближчі 24 години.';
  end if;
  update public.buyers set next_change_at = p_at, next_change_by = auth.uid() where id = p_buyer;
  if not found then raise exception 'Немає такого скупника.'; end if;
end $$;
revoke all on function public.set_next_change(text, timestamptz) from public;
grant execute on function public.set_next_change(text, timestamptz) to authenticated;

create or replace view public.buyer_next_change as
select b.id as buyer_id, b.next_change_at, p.game_name, p.static_id
from public.buyers b left join public.profiles p on p.id = b.next_change_by;
grant select on public.buyer_next_change to anon, authenticated;
