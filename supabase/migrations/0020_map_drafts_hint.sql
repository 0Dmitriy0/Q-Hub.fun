-- Q-Hub: підказка редактора до чернетки мітки. Коли F9 не знайшов точку, редактор у програмі може вибрати категорію
-- й написати опис — адмін бачить їх готовими у формі публікації. Категорія лише з наявних; видалили категорію —
-- підказка просто зникає. Права (0019) не змінюються: подає editor/moderator/admin від себе, бачать автор і адмін.
-- Файл можна запускати повторно.
alter table public.map_drafts add column if not exists category_id text
  references public.map_categories (id) on delete set null on update cascade;
alter table public.map_drafts add column if not exists note text not null default '' check (length(note) <= 600);
