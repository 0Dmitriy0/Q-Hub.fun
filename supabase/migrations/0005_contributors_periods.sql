-- Q-Hub: рейтинг тих, хто вносить ціни, — за 7 днів, місяць, рік і весь час.
-- Нові стовпці додаються в кінець view, тож попередні запити сайту працюють як раніше.
create or replace view public.contributors as
select p.id, p.name, p.avatar_url,
       count(*) filter (where r.created_at > now() - interval '7 days') as week,
       count(*) as total,
       max(r.created_at) as last_at,
       count(*) filter (where r.created_at > now() - interval '1 month') as month,
       count(*) filter (where r.created_at > now() - interval '1 year') as year
from public.price_reports r join public.profiles p on p.id = r.reporter
where r.kind = 'buyer'
group by p.id, p.name, p.avatar_url;

grant select on public.contributors to anon, authenticated;
