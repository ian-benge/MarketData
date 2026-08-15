-- Coverage workspace: personal vs shared watchlists, archive/reorder,
-- item tags, and sector/theme/custom baskets. Members may insert instruments
-- so ticker add does not require an admin.

-- ---------------------------------------------------------------------------
-- Watchlists
-- ---------------------------------------------------------------------------

alter table public.watchlists
  add column if not exists visibility text not null default 'shared',
  add column if not exists owner_id uuid references public.profiles (id) on delete cascade,
  add column if not exists archived_at timestamptz,
  add column if not exists sort_order integer not null default 0;

alter table public.watchlists
  drop constraint if exists watchlists_visibility_chk;
alter table public.watchlists
  add constraint watchlists_visibility_chk
  check (visibility in ('shared', 'personal'));

alter table public.watchlists
  drop constraint if exists watchlists_personal_owner_chk;
alter table public.watchlists
  add constraint watchlists_personal_owner_chk
  check (visibility <> 'personal' or owner_id is not null);

alter table public.watchlists
  drop constraint if exists watchlists_personal_not_default_chk;
alter table public.watchlists
  add constraint watchlists_personal_not_default_chk
  check (visibility <> 'personal' or is_default = false);

alter table public.watchlists
  drop constraint if exists watchlists_firm_id_name_key;

drop index if exists public.watchlists_shared_name_uidx;
create unique index watchlists_shared_name_uidx
  on public.watchlists (firm_id, lower(name))
  where visibility = 'shared' and archived_at is null;

drop index if exists public.watchlists_personal_name_uidx;
create unique index watchlists_personal_name_uidx
  on public.watchlists (firm_id, owner_id, lower(name))
  where visibility = 'personal' and archived_at is null;

drop index if exists public.watchlists_one_default_uidx;
create unique index watchlists_one_default_uidx
  on public.watchlists (firm_id)
  where is_default = true and visibility = 'shared' and archived_at is null;

create index if not exists watchlists_firm_sort_idx
  on public.watchlists (firm_id, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- Watchlist items
-- ---------------------------------------------------------------------------

alter table public.watchlist_items
  add column if not exists tags text[] not null default '{}'::text[];

-- ---------------------------------------------------------------------------
-- Sectors / themes / custom baskets
-- ---------------------------------------------------------------------------

alter table public.sectors
  add column if not exists kind text not null default 'sector',
  add column if not exists parent_id uuid references public.sectors (id) on delete set null,
  add column if not exists archived_at timestamptz;

alter table public.sectors
  drop constraint if exists sectors_kind_chk;
alter table public.sectors
  add constraint sectors_kind_chk
  check (kind in ('sector', 'industry', 'theme', 'custom'));

create index if not exists sectors_firm_sort_idx
  on public.sectors (firm_id, sort_order, name);

-- Existing AI infrastructure groups are thematic coverage, not GICS sectors.
update public.sectors
set kind = 'theme'
where slug in (
  'semiconductors',
  'photonics',
  'hyperscalers',
  'data-centers',
  'power-grid-nuclear-gas',
  'ai-software'
)
  and kind = 'sector';

-- ---------------------------------------------------------------------------
-- Instruments: members may add unknown tickers
-- ---------------------------------------------------------------------------

drop policy if exists instruments_insert_member on public.instruments;
create policy instruments_insert_member
  on public.instruments for insert to authenticated
  with check (public.auth_is_active_member());

-- ---------------------------------------------------------------------------
-- RLS: personal watchlists are owner-only; shared remain firm-wide
-- ---------------------------------------------------------------------------

drop policy if exists watchlists_select_firm on public.watchlists;
create policy watchlists_select_firm
  on public.watchlists for select to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      visibility = 'shared'
      or owner_id = auth.uid()
    )
  );

drop policy if exists watchlists_insert_member on public.watchlists;
create policy watchlists_insert_member
  on public.watchlists for insert to authenticated
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      visibility = 'shared'
      or (visibility = 'personal' and owner_id = auth.uid())
    )
  );

drop policy if exists watchlists_update_member on public.watchlists;
create policy watchlists_update_member
  on public.watchlists for update to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      visibility = 'shared'
      or owner_id = auth.uid()
    )
  )
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      visibility = 'shared'
      or (visibility = 'personal' and owner_id = auth.uid())
    )
  );

drop policy if exists watchlists_delete_member on public.watchlists;
create policy watchlists_delete_member
  on public.watchlists for delete to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and (
      visibility = 'shared'
      or owner_id = auth.uid()
    )
  );

drop policy if exists watchlist_items_select_firm on public.watchlist_items;
create policy watchlist_items_select_firm
  on public.watchlist_items for select to authenticated
  using (
    public.auth_is_active_member()
    and exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.firm_id = public.auth_firm_id()
        and (w.visibility = 'shared' or w.owner_id = auth.uid())
    )
  );

drop policy if exists watchlist_items_insert_member on public.watchlist_items;
create policy watchlist_items_insert_member
  on public.watchlist_items for insert to authenticated
  with check (
    public.auth_is_active_member()
    and exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.firm_id = public.auth_firm_id()
        and (w.visibility = 'shared' or w.owner_id = auth.uid())
    )
  );

drop policy if exists watchlist_items_update_member on public.watchlist_items;
create policy watchlist_items_update_member
  on public.watchlist_items for update to authenticated
  using (
    public.auth_is_active_member()
    and exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.firm_id = public.auth_firm_id()
        and (w.visibility = 'shared' or w.owner_id = auth.uid())
    )
  )
  with check (
    public.auth_is_active_member()
    and exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.firm_id = public.auth_firm_id()
        and (w.visibility = 'shared' or w.owner_id = auth.uid())
    )
  );

drop policy if exists watchlist_items_delete_member on public.watchlist_items;
create policy watchlist_items_delete_member
  on public.watchlist_items for delete to authenticated
  using (
    public.auth_is_active_member()
    and exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.firm_id = public.auth_firm_id()
        and (w.visibility = 'shared' or w.owner_id = auth.uid())
    )
  );
