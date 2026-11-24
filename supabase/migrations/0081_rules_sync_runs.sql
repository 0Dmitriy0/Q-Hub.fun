-- Q-Hub: журнал спроб оновлення правил (specs/095). Форум не пускає сервер, тож правила приносить і програма адміна;
-- тут видно, коли, звідки (сервер чи програма адміна), хто й з яким результатом. Остання вдала спроба —
-- щоб програма адміна не читала форум частіше разу на добу, а щоденна перевірка на GitHub не червоніла даремно.
-- • Читає лише admin (конституція II); пише лише функція rules-sync service-ключем — політик на запис немає.
-- • Рядки старші 90 днів функція видаляє сама.
-- Файл можна запускати повторно.

create table if not exists public.rules_sync_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  via text not null check (via in ('server', 'app')),
  by uuid references auth.users (id) on delete set null,
  ok boolean not null,
  topics integer,
  items integer,
  changes integer,
  error text
);
create index if not exists rules_sync_runs_ok_at on public.rules_sync_runs (ok, at desc);

alter table public.rules_sync_runs enable row level security;
drop policy if exists "rules_sync_runs: admin read" on public.rules_sync_runs;
create policy "rules_sync_runs: admin read" on public.rules_sync_runs for select using (public.is_admin());
