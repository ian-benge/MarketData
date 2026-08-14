-- User-defined book tab order. Existing rows keep Main-first, then title,
-- matching the previous decorateBooks sort so the blotter does not reshuffle.

alter table public.position_books
  add column if not exists sort_order integer not null default 0;

create index if not exists position_books_owner_sort_idx
  on public.position_books (firm_id, owner_id, sort_order);

with ranked as (
  select
    id,
    row_number() over (
      partition by firm_id, owner_id
      order by
        case when title = 'Main' then 0 else 1 end,
        title
    ) - 1 as next_order
  from public.position_books
)
update public.position_books as books
set sort_order = ranked.next_order
from ranked
where books.id = ranked.id;
