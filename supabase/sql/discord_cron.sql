-- Q-Hub: розклад Discord-бота (specs/060 US1, research R2) — щохвилини кличе функцію discord-bot з дією tick.
-- НЕ міграція: тестова база (supabase/tests/run.sh) не має pg_cron. Запускає власник у Supabase → SQL Editor, один раз
-- (повторний запуск — замінює розклад, нічого не дублює).
--
-- Перед запуском:
--   1. Database → Extensions: увімкнути pg_cron і pg_net.
--   2. Міграція 0055_discord_bot.sql уже застосована.
--   3. Функція задеплоєна: npx.cmd supabase functions deploy discord-bot --project-ref mcuolznwwvptffcueswm --use-api --no-verify-jwt
--   4. Секрет DISCORD_SYNC_SECRET задано у функції (Edge Functions → Secrets) — той самий рядок вписати нижче ЗАМІСТЬ <СЕКРЕТ>.
-- Секрет лягає у Vault бази (зашифровано), не в розклад і не в репозиторій. У git цей файл — лише з <СЕКРЕТ>.

do $$
begin
  if exists (select 1 from vault.secrets where name = 'discord_sync_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'discord_sync_secret'), '<СЕКРЕТ>');
  else
    perform vault.create_secret('<СЕКРЕТ>', 'discord_sync_secret');
  end if;
  if not exists (select 1 from vault.secrets where name = 'discord_fn_url') then
    perform vault.create_secret('https://mcuolznwwvptffcueswm.supabase.co/functions/v1/discord-bot', 'discord_fn_url');
  end if;
end $$;

select cron.unschedule('discord-tick') where exists (select 1 from cron.job where jobname = 'discord-tick');
select cron.schedule('discord-tick', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'discord_fn_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'discord_sync_secret')),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 30000)
$job$);

-- Перевірка через 2–3 хвилини: останні запуски й відповіді функції
-- select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'discord-tick') order by start_time desc limit 5;
-- select status_code, content from net._http_response order by created desc limit 5;
-- Вимкнути: select cron.unschedule('discord-tick');
