-- Privileges for PostgREST roles.
-- Tables created in the SQL Editor are often missing these grants, which
-- surfaces as: permission denied for table <name>
-- service_role still bypasses RLS; authenticated remains constrained by RLS.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete, references, trigger
  on all tables in schema public
  to service_role;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to service_role, authenticated;

grant execute on all functions in schema public to authenticated, service_role;
