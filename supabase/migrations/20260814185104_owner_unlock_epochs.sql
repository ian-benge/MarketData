-- Epoch counters so teammate book unlocks can be revoked without waiting
-- for the 8-hour cookie to expire. Bumping the firm epoch invalidates every
-- grant on the desk; bumping a profile epoch invalidates grants for that
-- owner's book only.

alter table public.firms
  add column if not exists owner_unlock_epoch integer not null default 0;

alter table public.profiles
  add column if not exists owner_unlock_epoch integer not null default 0;

alter table public.firms
  drop constraint if exists firms_owner_unlock_epoch_nonnegative;
alter table public.firms
  add constraint firms_owner_unlock_epoch_nonnegative
  check (owner_unlock_epoch >= 0);

alter table public.profiles
  drop constraint if exists profiles_owner_unlock_epoch_nonnegative;
alter table public.profiles
  add constraint profiles_owner_unlock_epoch_nonnegative
  check (owner_unlock_epoch >= 0);

create or replace function public.guard_owner_unlock_epoch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.owner_unlock_epoch < old.owner_unlock_epoch then
    raise exception 'owner_unlock_epoch cannot decrease';
  end if;
  return new;
end;
$$;

drop trigger if exists firms_guard_owner_unlock_epoch on public.firms;
create trigger firms_guard_owner_unlock_epoch
  before update of owner_unlock_epoch on public.firms
  for each row execute function public.guard_owner_unlock_epoch();

drop trigger if exists profiles_guard_owner_unlock_epoch on public.profiles;
create trigger profiles_guard_owner_unlock_epoch
  before update of owner_unlock_epoch on public.profiles
  for each row execute function public.guard_owner_unlock_epoch();

create or replace function public.bump_owner_unlock_epoch(scope text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_epoch integer;
begin
  if scope = 'self' then
    if auth.uid() is null then
      raise exception 'unauthorized';
    end if;
    update public.profiles
      set owner_unlock_epoch = owner_unlock_epoch + 1
      where id = auth.uid()
      returning owner_unlock_epoch into next_epoch;
    if next_epoch is null then
      raise exception 'profile not found';
    end if;
    return next_epoch;
  end if;

  if scope = 'desk' then
    if not public.auth_is_admin() then
      raise exception 'forbidden';
    end if;
    update public.firms
      set owner_unlock_epoch = owner_unlock_epoch + 1
      where id = public.auth_firm_id()
      returning owner_unlock_epoch into next_epoch;
    if next_epoch is null then
      raise exception 'firm not found';
    end if;
    return next_epoch;
  end if;

  raise exception 'invalid scope';
end;
$$;

revoke all on function public.bump_owner_unlock_epoch(text) from public, anon;
grant execute on function public.bump_owner_unlock_epoch(text) to authenticated;

comment on column public.firms.owner_unlock_epoch is
  'Increment to revoke every teammate book-unlock cookie on this desk.';
comment on column public.profiles.owner_unlock_epoch is
  'Increment to revoke teammate unlocks of this user''s book.';
