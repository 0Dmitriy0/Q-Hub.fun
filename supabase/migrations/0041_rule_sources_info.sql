-- Q-Hub: тип джерела «Довідка» (info) — F.A.Q. і пояснення з форуму («Новини та інформація»): не правило й не закон,
-- за них ніхто не карає. Програма показує мітку «Довідка», помічник не подає їх як заборони (specs/010).
-- Файл можна запускати повторно.
alter table public.rule_sources drop constraint if exists rule_sources_kind_check;
alter table public.rule_sources add constraint rule_sources_kind_check check (kind in ('rules', 'law', 'order', 'info'));
