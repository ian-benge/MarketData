-- Full-text search maintenance for reports archive.

create or replace function public.refresh_report_search_vector(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_summary text;
  v_sections text;
begin
  select r.title, coalesce(r.executive_summary, '')
  into v_title, v_summary
  from public.reports r
  where r.id = p_report_id;

  if not found then
    return;
  end if;

  select coalesce(string_agg(rs.title || ' ' || coalesce(rs.body_markdown, ''), ' '), '')
  into v_sections
  from public.report_sections rs
  where rs.report_id = p_report_id;

  update public.reports
  set search_vector =
    setweight(to_tsvector('english', coalesce(v_title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(v_summary, '')), 'B')
    || setweight(to_tsvector('english', coalesce(v_sections, '')), 'C')
  where id = p_report_id;
end;
$$;

create or replace function public.reports_search_vector_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_report_search_vector(new.id);
  return new;
end;
$$;

create or replace function public.report_sections_search_vector_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
begin
  v_report_id := coalesce(new.report_id, old.report_id);
  if v_report_id is not null then
    perform public.refresh_report_search_vector(v_report_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reports_search_vector_aiu on public.reports;
create trigger reports_search_vector_aiu
  after insert or update of title, executive_summary
  on public.reports
  for each row
  execute function public.reports_search_vector_trigger();

drop trigger if exists report_sections_search_vector_aiud on public.report_sections;
create trigger report_sections_search_vector_aiud
  after insert or update of title, body_markdown or delete
  on public.report_sections
  for each row
  execute function public.report_sections_search_vector_trigger();

create index if not exists reports_search_vector_gin_idx
  on public.reports using gin (search_vector);

create index if not exists reports_title_trgm_idx
  on public.reports using gin (title gin_trgm_ops);

revoke all on function public.refresh_report_search_vector(uuid) from public;
grant execute on function public.refresh_report_search_vector(uuid) to service_role;
