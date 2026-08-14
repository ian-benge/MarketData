-- Teammates can no longer read another user's lots, books, or brokerage
-- rows from the Data API. The app loads another blotter only after that
-- user's password is verified. Email alerts do not use these policies.

drop policy if exists positions_select_firm on public.positions;

create policy positions_select_own
  on public.positions for select to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      created_by = auth.uid()
      or public.auth_is_admin()
    )
  );

drop policy if exists position_books_select_firm on public.position_books;

create policy position_books_select_own
  on public.position_books for select to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      owner_id = auth.uid()
      or public.auth_is_admin()
    )
  );

drop policy if exists brokerage_connections_select_firm
  on public.brokerage_connections;

create policy brokerage_connections_select_own
  on public.brokerage_connections for select to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      user_id = auth.uid()
      or public.auth_is_admin()
    )
  );

drop policy if exists brokerage_accounts_select_firm
  on public.brokerage_accounts;

create policy brokerage_accounts_select_own
  on public.brokerage_accounts for select to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      user_id = auth.uid()
      or public.auth_is_admin()
    )
  );
