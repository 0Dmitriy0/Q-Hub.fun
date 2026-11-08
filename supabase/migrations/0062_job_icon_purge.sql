-- Q-Hub: адмін міняє іконку роботи й видаляє прибрану (тестову) роботу назавжди (прохання власника 2026-11-08).
-- • jobs.icon — адреса картинки в публічному бакеті catalog (тека jobs/, вантажить admin, 0006); порожньо — /icons/jobs/<id>.svg.
--   Не поле довідника: у пропозиціях і версіях його немає (не в wiki_clean / FIELDS), міняє лише admin напряму («jobs: admin write»).
-- • wiki_purge_job — лише admin і лише сторінка, яку вже прибрано (hidden): видаляє роботу, її історію, позначки
--   «перевірено», нотатки й пропозиції. Звичайне «Прибрати сторінку» лишається для гравців і модераторів.
-- Файл можна запускати повторно.
alter table public.jobs add column if not exists icon text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_icon_url') then
    alter table public.jobs add constraint jobs_icon_url check (icon = '' or icon ~ '^https://[^\s"''<>]+$');
  end if;
end $$;

create or replace function public.wiki_purge_job(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'QH010', message = 'Видаляти сторінки назавжди може лише адмін.';
  end if;
  if not exists (select 1 from public.jobs where id = p_id) then
    raise exception using errcode = 'QH014', message = 'Такої сторінки вже немає.';
  end if;
  if not (select hidden from public.jobs where id = p_id) then
    raise exception using errcode = 'QH003', message = 'Спершу прибери сторінку — видалити назавжди можна лише прибрану.';
  end if;
  /* пропозиції: усі по цій роботі й та, що її створила (у «new» target_id порожній — шукаємо через версії й адресу) */
  delete from public.wiki_proposals where section = 'job' and (target_id = p_id
    or id in (select proposal_id from public.wiki_versions where section = 'job' and target_id = p_id and proposal_id is not null)
    or (kind = 'new' and data ->> 'id' = p_id));
  delete from public.wiki_versions where section = 'job' and target_id = p_id;
  delete from public.wiki_checks where section = 'job' and target_id = p_id;
  delete from public.wiki_notes where section = 'job' and target_id = p_id;
  delete from public.jobs where id = p_id;
end $$;
revoke execute on function public.wiki_purge_job(text) from public, anon;
grant execute on function public.wiki_purge_job(text) to authenticated;
