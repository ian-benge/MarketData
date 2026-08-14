-- Poll brokerage holdings every 10 seconds. Skip queueing another HTTP
-- call if a sync request is already waiting in pg_net.

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
  if exists (
    select 1
    from net.http_request_queue
    where url like '%/api/cron/brokerage'
  ) then
    return null;
  end if;

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
    timeout_milliseconds := 25000
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
  '10 seconds',
  $$select private.invoke_brokerage_cron()$$
);
