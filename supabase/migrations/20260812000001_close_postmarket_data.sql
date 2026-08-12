-- Apply after 20260812000000_close_postmarket_edition.sql has committed.
-- Uses enum value `close_postmarket` and adds briefing columns / types.

do $$ begin
  create type public.thesis_status as enum (
    'confirmed',
    'pending',
    'weakened',
    'invalidated',
    'target_reached'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.report_calendar_kind as enum (
    'regular',
    'early_close',
    'holiday_skip'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.report_runs
  add column if not exists schedule_version text not null default 'v3-close-postmarket',
  add column if not exists scheduled_at timestamptz,
  add column if not exists collect_after timestamptz,
  add column if not exists publish_after timestamptz,
  add column if not exists session_close_at timestamptz,
  add column if not exists calendar_kind public.report_calendar_kind not null default 'regular';

alter table public.reports
  add column if not exists canonical_json jsonb;

alter table public.report_configs
  add column if not exists schedule_version text not null default 'v3-close-postmarket',
  add column if not exists calendar_overrides jsonb not null default '{}'::jsonb;

-- Existing close rows become the combined edition.
update public.report_runs
set edition = 'close_postmarket'
where edition = 'close';

update public.reports
set edition = 'close_postmarket'
where edition = 'close';

update public.report_configs
set editions = jsonb_build_object(
    'premarket', coalesce(editions->>'premarket', '07:30'),
    'midday', coalesce(editions->>'midday', '11:30'),
    'close_postmarket', '16:00'
  ),
  schedule_version = 'v3-close-postmarket'
where editions ? 'close'
   or not (editions ? 'close_postmarket');

alter table public.report_configs
  alter column editions set default jsonb_build_object(
    'premarket', '07:30',
    'midday', '11:30',
    'close_postmarket', '16:00'
  );

comment on column public.report_runs.publish_after is
  'PDF/archive/email must wait until this instant (16:00 CT, or official early close + 1 hour).';
comment on column public.report_runs.collect_after is
  'Internal collection may begin at this instant (15:00 CT on normal days).';
comment on column public.reports.canonical_json is
  'Structured report document (theses, prior-edition audit, after-hours block).';
