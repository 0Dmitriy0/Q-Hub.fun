-- Q-Hub 0058: рейтинг довідника (specs/043 US4) показує нік у Q-Hub, а не ім'я Discord — як рейтинг цін (0038, specs/025 FR-011).
-- Ті самі стовпці в тому самому порядку, тож create or replace працює і запити сайту не змінюються.
create or replace view public.wiki_contributors as
select pr.id, coalesce(nullif(btrim(pr.nick), ''), pr.name) as name, pr.avatar_url,
       count(*) filter (where p.status in ('accepted', 'accepted_edited') and p.kind <> 'new') as accepted_edits,
       count(*) filter (where p.status in ('accepted', 'accepted_edited') and p.kind = 'new') as accepted_pages,
       count(*) filter (where p.status = 'rejected') as rejected,
       max(p.decided_at) as last_at
from public.wiki_proposals p join public.profiles pr on pr.id = p.author
group by pr.id, pr.nick, pr.name, pr.avatar_url
having count(*) filter (where p.status in ('accepted', 'accepted_edited')) > 0;
grant select on public.wiki_contributors to anon, authenticated;
