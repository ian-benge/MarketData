-- Closed lots imported from SnapTrade activity history use
-- external_id values prefixed with hist:. Keep those identities unique
-- so re-running Import past trades is idempotent. Open holdings still
-- use instrument ids and the existing open-only unique index.

create unique index if not exists positions_imported_history_identity_idx
  on public.positions (brokerage_account_id, external_id)
  where source = 'snaptrade'
    and brokerage_account_id is not null
    and external_id like 'hist:%';
