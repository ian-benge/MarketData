-- Background brokerage holdings sync. Vercel Hobby only allows daily
-- crons, so pg_cron + pg_net hit /api/cron/brokerage every two minutes.
-- The Bearer token is read from vault.decrypted_secrets (name =
-- brokerage_cron_secret). Do not put that secret in this file.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;

create or replace function private.invoke_brokerage_cron()
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  request_id bigint;
  app_url text;
  cron_secret text;
begin
  select decrypted_secret into app_url
  from vault.decrypted_secrets
  where name = 'brokerage_cron_url'
  limit 1;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'brokerage_cron_secret'
  limit 1;

  if cron_secret is null or btrim(cron_secret) = '' then
    raise warning 'brokerage cron skipped: vault secret brokerage_cron_secret is missing';
    return null;
  end if;

  app_url := rtrim(
    coalesce(nullif(btrim(app_url), ''), 'https://ibmarketdata.vercel.app'),
    '/'
  );

  select net.http_post(
    url := app_url || '/api/cron/brokerage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 100000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_brokerage_cron() from public, anon, authenticated;
grant execute on function private.invoke_brokerage_cron() to postgres;

select cron.unschedule(jobid)
from cron.job
where jobname = 'brokerage-holdings-sync';

select cron.schedule(
  'brokerage-holdings-sync',
  '*/2 * * * *',
  $$select private.invoke_brokerage_cron()$$
);
