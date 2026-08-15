-- Desk intelligence briefs (grounded LLM / rules compilation cache).
-- Authenticated members may read firm rows. Writes are service-role only.

create table public.desk_intelligence_briefs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  kind text not null,
  subject text not null default '',
  evidence_hash text not null,
  prompt_version text not null,
  method text not null default 'rules',
  model text,
  provider_name text,
  output jsonb not null default '{}'::jsonb,
  grounding jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint desk_intelligence_briefs_kind_chk
    check (kind in (
      'session_brief',
      'move_narrative',
      'book_risk',
      'news_digest',
      'grounded_ask',
      'query_parse'
    )),
  constraint desk_intelligence_briefs_method_chk
    check (method in ('rules', 'model'))
);

create unique index desk_intelligence_briefs_cache_uidx
  on public.desk_intelligence_briefs (firm_id, kind, subject, evidence_hash);

create index desk_intelligence_briefs_firm_kind_idx
  on public.desk_intelligence_briefs (firm_id, kind, created_at desc);

create trigger desk_intelligence_briefs_set_updated_at
  before update on public.desk_intelligence_briefs
  for each row
  execute function public.set_updated_at();

alter table public.desk_intelligence_briefs enable row level security;

create policy desk_intelligence_briefs_select_member
  on public.desk_intelligence_briefs for select to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
  );

revoke insert, update, delete on public.desk_intelligence_briefs from authenticated, anon;
