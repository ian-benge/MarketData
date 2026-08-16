-- P1-006: members may propose unverified instruments but cannot
-- resolve, quarantine, or rewrite the shared catalog.

drop policy if exists instruments_update_member on public.instruments;

insert into public.instrument_aliases (instrument_id, alias, source)
select i.id, a.alias, 'seed'
from public.instruments i
join (
  values
    ('META', 'FACEBOOK'),
    ('META', 'FB'),
    ('META', 'META PLATFORMS'),
    ('GOOGL', 'GOOG'),
    ('GOOGL', 'ALPHABET'),
    ('GOOG', 'GOOGL'),
    ('BRK.B', 'BRK-B'),
    ('BRK.B', 'BERKSHIRE'),
    ('BRK.A', 'BRK-A')
) as a(symbol, alias) on upper(i.symbol) = a.symbol
on conflict (alias) do nothing;
