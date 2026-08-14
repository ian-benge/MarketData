-- Shared secret for pg_cron -> /api/cron/brokerage. Generated in Vault so
-- it never has to live in a migration file or the Vercel Hobby env pull path.
-- The Next.js route checks CRON_SECRET first, then this RPC via service role.

create extension if not exists pgcrypto with schema extensions;

do $seed$
begin
  if not exists (
    select 1 from vault.secrets where name = 'brokerage_cron_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'brokerage_cron_secret',
      'Bearer token for /api/cron/brokerage'
    );
  end if;
end;
$seed$;

create or replace function public.verify_brokerage_cron_secret(provided text)
returns boolean
language sql
stable
security definer
set search_path = vault
as $$
  select
    provided is not null
    and length(btrim(provided)) > 0
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'brokerage_cron_secret'
        and decrypted_secret = btrim(provided)
    );
$$;

revoke all on function public.verify_brokerage_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_brokerage_cron_secret(text) to service_role;
