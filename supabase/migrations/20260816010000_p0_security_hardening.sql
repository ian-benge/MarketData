-- P0-007 / P1-015: hide invitation hashes, own-row book settings,
-- and keep unlock-attempt rows off the Data API.

drop policy if exists invitations_select_firm on public.invitations;

create policy invitations_select_admin
  on public.invitations for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin());

-- Hosted already uses position_books (own-row). Legacy
-- position_book_settings was never created on this project.
do $$
begin
  if to_regclass('public.position_book_settings') is not null then
    execute $sql$
      drop policy if exists position_book_settings_select_firm
        on public.position_book_settings
    $sql$;
    execute $sql$
      create policy position_book_settings_select_own
        on public.position_book_settings for select to authenticated
        using (
          firm_id = public.auth_firm_id()
          and public.auth_is_active_member()
          and (
            owner_id = auth.uid()
            or public.auth_is_admin()
          )
        )
    $sql$;
  end if;
end $$;

create table if not exists public.owner_unlock_failures (
  viewer_id uuid not null,
  owner_id text not null,
  failed_at timestamptz not null default timezone('utc', now())
);

create index if not exists owner_unlock_failures_lookup_idx
  on public.owner_unlock_failures (viewer_id, owner_id, failed_at desc);

alter table public.owner_unlock_failures enable row level security;

revoke all on table public.owner_unlock_failures from public, anon, authenticated;
grant all on table public.owner_unlock_failures to service_role;

-- Trigger helpers are not a Data API surface.
revoke all on function public.report_sections_search_vector_trigger() from public, anon, authenticated;
revoke all on function public.reports_search_vector_trigger() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
