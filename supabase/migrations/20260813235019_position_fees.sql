-- Trade commissions/fees from brokerage fills (and leftover FEE
-- activities) so realized P&L can be shown net of costs.

alter table public.positions
  add column fees numeric(20, 8) not null default 0;

alter table public.positions
  add constraint positions_fees_nonnegative check (fees >= 0);

alter table public.position_books
  add column fees numeric(20, 8) not null default 0;

alter table public.position_books
  add constraint position_books_fees_nonnegative check (fees >= 0);
