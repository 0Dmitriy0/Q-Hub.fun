-- Q-Hub: джерела правил сервера й законів штату (specs/010, US3). Адмін додає посилання на розділ чи тему форуму QuantRP,
-- функція rules-sync обходить їх і кладе знімок у публічний бакет rules (rules.json) — програма бере його без нової версії.
-- • Лише форум сервера: адреса MUST починатися з https://forum.quant5.com.ua/index.php?/forum/ або …/topic/ (FR-011).
-- • Бачить і змінює лише admin (конституція II); функція пише service-ключем.
-- • Тема з enabled = false усередині увімкненого розділу — виключення: розділ її пропускає (FR-010).
-- Файл можна запускати повторно.

create table if not exists public.rule_sources (
  id bigint generated always as identity primary key,
  url text not null unique check (url ~ '^https://forum\.quant5\.com\.ua/index\.php\?/(forum|topic)/[^\s"''<>]+$'),
  kind text not null check (kind in ('rules', 'law', 'order')),
  enabled boolean not null default true,
  title text,
  items integer not null default 0 check (items >= 0),
  synced_at timestamptz,
  error text,
  diff jsonb,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.rule_sources enable row level security;
drop policy if exists "rule_sources: admin" on public.rule_sources;
create policy "rule_sources: admin" on public.rule_sources for all
  using (public.is_admin()) with check (public.is_admin());

-- за замовчуванням — два розділи, з яких зібрано вбудовану копію (scripts/fetch-rules.mjs, parse.ts DEFAULT_SOURCES)
insert into public.rule_sources (url, kind, title, created_by) values
  ('https://forum.quant5.com.ua/index.php?/forum/10-правила-серверу/', 'rules', 'Правила серверу', null),
  ('https://forum.quant5.com.ua/index.php?/forum/36-законодавча-база-штату/', 'law', 'Законодавча база Штату', null)
on conflict (url) do nothing;

-- знімок правил: читають усі за прямим посиланням (публічний бакет), пише лише функція (service-ключ, без політик запису)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rules', 'rules', true, 5242880, array['application/json'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
