-- Three-edition model: add `close_postmarket` (16:00 CT combined close +
-- first-hour after-hours). Postgres cannot easily drop enum values; `close`
-- remains unused.
--
-- This file MUST be its own transaction. Postgres error 55P04: a new enum
-- value cannot be used until the ADD VALUE transaction commits. The SQL
-- editor wraps a paste in one transaction — run this file, then
-- 20260812000001_close_postmarket_data.sql.

alter type public.report_edition add value if not exists 'close_postmarket';
