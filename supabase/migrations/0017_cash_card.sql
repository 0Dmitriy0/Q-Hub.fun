-- Готівка й картка окремо. Кожен запис обліку — з рахунку «cash» або «card»; персонаж має стартову суму на картці
-- (старт готівки = start_balance − start_card, тож наявні дані не змінюються: усе досі вважається готівкою).
-- Переказ між рахунками — пара записів з source = 'transfer' (мінус з одного, плюс на інший): баланс разом не змінюється,
-- а в прибутках і витратах переказ не рахується.
alter table public.transactions add column if not exists account text not null default 'cash';
alter table public.transactions drop constraint if exists transactions_account_check;
alter table public.transactions add constraint transactions_account_check check (account in ('cash', 'card'));

alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions add constraint transactions_source_check
  check (source in ('manual', 'deal', 'desktop', 'import', 'reconcile', 'transfer'));

alter table public.characters add column if not exists start_card bigint not null default 0;
