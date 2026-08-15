-- Market-wide headline intelligence (public wires/filings, not firm-private).
-- Authenticated members may read. Writes are service-role only (no insert policies).

create or replace function public.text_array_join(arr text[])
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select coalesce(pg_catalog.array_to_string(arr, ' '), '');
$$;

revoke all on function public.text_array_join(text[]) from public;

create table public.market_news_items (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  external_id text not null,
  title text not null,
  summary text,
  url text not null,
  canonical_url text,
  content_hash text,
  published_at timestamptz not null,
  retrieved_at timestamptz not null default timezone('utc', now()),
  publisher text,
  source_class text not null default 'unknown',
  source_quality public.source_quality not null default 'secondary',
  tickers text[] not null default '{}',
  resolved_tickers text[] not null default '{}',
  event_type text not null default 'other',
  themes text[] not null default '{}',
  novelty text not null default 'new',
  materiality_score numeric not null default 0,
  raw jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(summary, '')), 'B')
    || setweight(to_tsvector('english', public.text_array_join(tickers)), 'A')
    || setweight(to_tsvector('english', public.text_array_join(resolved_tickers)), 'A')
    || setweight(to_tsvector('english', public.text_array_join(themes)), 'B')
    || setweight(to_tsvector('english', coalesce(event_type, '')), 'C')
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index market_news_items_provider_external_uidx
  on public.market_news_items (provider_name, external_id);

create index market_news_items_published_idx
  on public.market_news_items (published_at desc);

create index market_news_items_tickers_gin_idx
  on public.market_news_items using gin (tickers);

create index market_news_items_resolved_gin_idx
  on public.market_news_items using gin (resolved_tickers);

create index market_news_items_search_gin_idx
  on public.market_news_items using gin (search_vector);

create index market_news_items_event_published_idx
  on public.market_news_items (event_type, published_at desc);

create trigger market_news_items_set_updated_at
  before update on public.market_news_items
  for each row
  execute function public.set_updated_at();

alter table public.market_news_items enable row level security;

create policy market_news_items_select_member
  on public.market_news_items for select to authenticated
  using (public.auth_is_active_member());

revoke insert, update, delete on public.market_news_items from authenticated, anon;

create table public.news_saved_searches (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  query text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index news_saved_searches_user_updated_idx
  on public.news_saved_searches (user_id, updated_at desc);

create unique index news_saved_searches_user_name_uidx
  on public.news_saved_searches (user_id, name);

create trigger news_saved_searches_set_updated_at
  before update on public.news_saved_searches
  for each row
  execute function public.set_updated_at();

alter table public.news_saved_searches enable row level security;

create policy news_saved_searches_select_own
  on public.news_saved_searches for select to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy news_saved_searches_insert_own
  on public.news_saved_searches for insert to authenticated
  with check (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy news_saved_searches_update_own
  on public.news_saved_searches for update to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  )
  with check (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy news_saved_searches_delete_own
  on public.news_saved_searches for delete to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );
