-- Per-owner account equity for the Positions blotter.
-- account_value is total NAV including cash; cash is derived as
-- account_value − long market value at read time.

create table public.position_book_settings (
  firm_id uuid not null references public.firms (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  account_value numeric(20, 2),
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (firm_id, owner_id),
  constraint position_book_settings_account_value_positive check (
    account_value is null or account_value > 0
  )
);

create index position_book_settings_owner_idx
  on public.position_book_settings (owner_id);

create trigger position_book_settings_set_updated_at
  before update on public.position_book_settings
  for each row execute function public.set_updated_at();

alter table public.position_book_settings enable row level security;

create policy position_book_settings_select_firm
  on public.position_book_settings for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy position_book_settings_upsert_own
  on public.position_book_settings for insert to authenticated
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      owner_id = auth.uid()
      or public.auth_is_admin()
    )
  );

create policy position_book_settings_update_own
  on public.position_book_settings for update to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      owner_id = auth.uid()
      or public.auth_is_admin()
    )
  )
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      owner_id = auth.uid()
      or public.auth_is_admin()
    )
  );
