-- Named position books per owner. Each user can keep multiple titled
-- accounts (lots, NAV, buying power) under the same profile.
-- position_book_settings remains for one release; app code reads/writes
-- account_value on position_books after this migration.

create table public.position_books (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  account_value numeric(20, 2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint position_books_account_value_positive check (
    account_value is null or account_value > 0
  ),
  constraint position_books_title_len check (
    char_length(trim(title)) between 1 and 80
  )
);

create unique index position_books_firm_owner_title_idx
  on public.position_books (firm_id, owner_id, lower(trim(title)));

create index position_books_owner_idx
  on public.position_books (firm_id, owner_id);

create trigger position_books_set_updated_at
  before update on public.position_books
  for each row execute function public.set_updated_at();

alter table public.position_books enable row level security;

create policy position_books_select_firm
  on public.position_books for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy position_books_insert_own
  on public.position_books for insert to authenticated
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      owner_id = auth.uid()
      or public.auth_is_admin()
    )
  );

create policy position_books_update_own
  on public.position_books for update to authenticated
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

create policy position_books_delete_own
  on public.position_books for delete to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      owner_id = auth.uid()
      or public.auth_is_admin()
    )
  );

alter table public.positions
  add column book_id uuid references public.position_books (id) on delete restrict;

create index positions_book_id_idx
  on public.positions (book_id);

-- One Main book per owner: existing lots, optional legacy NAV, and active members.
-- Legacy position_book_settings is referenced only via EXECUTE so this
-- still runs when that table was never created.
do $$
begin
  if to_regclass('public.position_book_settings') is not null then
    execute $sql$
      insert into public.position_books (firm_id, owner_id, title, account_value)
      select
        owners.firm_id,
        owners.owner_id,
        'Main',
        s.account_value
      from (
        select distinct firm_id, created_by as owner_id
        from public.positions
        where created_by is not null
        union
        select firm_id, owner_id
        from public.position_book_settings
        union
        select firm_id, user_id
        from public.team_memberships
        where is_active = true
      ) as owners
      left join public.position_book_settings s
        on s.firm_id = owners.firm_id
        and s.owner_id = owners.owner_id
      where owners.owner_id is not null
        and not exists (
          select 1
          from public.position_books b
          where b.firm_id = owners.firm_id
            and b.owner_id = owners.owner_id
            and lower(trim(b.title)) = 'main'
        )
    $sql$;
  else
    insert into public.position_books (firm_id, owner_id, title, account_value)
    select
      owners.firm_id,
      owners.owner_id,
      'Main',
      null
    from (
      select distinct firm_id, created_by as owner_id
      from public.positions
      where created_by is not null
      union
      select firm_id, user_id
      from public.team_memberships
      where is_active = true
    ) as owners
    where owners.owner_id is not null
      and not exists (
        select 1
        from public.position_books b
        where b.firm_id = owners.firm_id
          and b.owner_id = owners.owner_id
          and lower(trim(b.title)) = 'main'
      );
  end if;
end $$;

update public.positions as p
set book_id = b.id
from public.position_books as b
where p.firm_id = b.firm_id
  and p.created_by = b.owner_id
  and b.title = 'Main'
  and p.created_by is not null
  and p.book_id is null;
