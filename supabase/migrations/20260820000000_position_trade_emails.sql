-- Per-member mute for desk email on trades in that member's position account.
-- Default on: existing open/close alerts keep sending until the owner turns them off.

alter table public.profiles
  add column if not exists position_trade_emails boolean not null default true;

comment on column public.profiles.position_trade_emails is
  'When false, IB Market Data does not send desk email for position open/close alerts on this member''s books.';
