-- Per-user position books. Firm members can view every book; only the
-- owner (or an admin) can insert, update, or close lots.

create index if not exists positions_firm_owner_idx
  on public.positions (firm_id, created_by, status);

drop policy if exists positions_insert_member on public.positions;
drop policy if exists positions_update_member on public.positions;
drop policy if exists positions_delete_member on public.positions;

create policy positions_insert_own
  on public.positions for insert to authenticated
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      created_by = auth.uid()
      or public.auth_is_admin()
    )
  );

create policy positions_update_own
  on public.positions for update to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      created_by = auth.uid()
      or public.auth_is_admin()
    )
  )
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      created_by = auth.uid()
      or public.auth_is_admin()
    )
  );

create policy positions_delete_own
  on public.positions for delete to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      created_by = auth.uid()
      or public.auth_is_admin()
    )
  );
