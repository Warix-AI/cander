-- Account-level monthly dollar spend periods (workspaces share one meter).

create table if not exists public.account_usage_periods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  plan text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  bill_amount_micros bigint not null,
  usable_budget_micros bigint not null,
  spent_micros bigint not null default 0,
  reserved_micros bigint not null default 0,
  status text not null default 'open'
    check (status in ('open', 'exhausted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, period_start)
);

create index if not exists account_usage_periods_profile_open_idx
  on public.account_usage_periods (profile_id, status, period_start desc);

drop trigger if exists account_usage_periods_updated_at on public.account_usage_periods;
create trigger account_usage_periods_updated_at
  before update on public.account_usage_periods
  for each row execute function public.set_updated_at();

alter table public.usage_events
  add column if not exists period_id uuid references public.account_usage_periods (id) on delete set null;

alter table public.usage_events
  add column if not exists billing_profile_id uuid references public.profiles (id) on delete set null;

create index if not exists usage_events_period_idx
  on public.usage_events (period_id)
  where period_id is not null;

-- Atomic spend reserve against account period.
create or replace function public.reserve_account_usage_spend(
  p_period_id uuid,
  p_cost_micros bigint
)
returns public.account_usage_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.account_usage_periods;
begin
  update public.account_usage_periods
  set
    reserved_micros = reserved_micros + p_cost_micros,
    status = case
      when spent_micros + reserved_micros + p_cost_micros >= usable_budget_micros
        then 'exhausted'
      else status
    end,
    updated_at = now()
  where id = p_period_id
    and status in ('open', 'exhausted')
    and spent_micros + reserved_micros + p_cost_micros <= usable_budget_micros
  returning * into result;

  if result.id is null then
    raise exception 'account_usage_budget_exceeded';
  end if;
  return result;
end;
$$;

create or replace function public.confirm_account_usage_spend(
  p_period_id uuid,
  p_reserved_micros bigint,
  p_actual_micros bigint
)
returns public.account_usage_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.account_usage_periods;
  delta bigint;
begin
  delta := greatest(p_actual_micros, 0) - greatest(p_reserved_micros, 0);
  update public.account_usage_periods
  set
    reserved_micros = greatest(reserved_micros - greatest(p_reserved_micros, 0), 0),
    spent_micros = spent_micros + greatest(p_actual_micros, 0),
    status = case
      when spent_micros + greatest(p_actual_micros, 0) >= usable_budget_micros
        then 'exhausted'
      when status = 'exhausted'
        and spent_micros + greatest(p_actual_micros, 0) < usable_budget_micros
        then 'open'
      else status
    end,
    updated_at = now()
  where id = p_period_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.release_account_usage_spend(
  p_period_id uuid,
  p_reserved_micros bigint
)
returns public.account_usage_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.account_usage_periods;
begin
  update public.account_usage_periods
  set
    reserved_micros = greatest(reserved_micros - greatest(p_reserved_micros, 0), 0),
    status = case
      when spent_micros + greatest(reserved_micros - greatest(p_reserved_micros, 0), 0)
        < usable_budget_micros
        and status = 'exhausted'
        then 'open'
      else status
    end,
    updated_at = now()
  where id = p_period_id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.reserve_account_usage_spend(uuid, bigint) from public;
revoke all on function public.confirm_account_usage_spend(uuid, bigint, bigint) from public;
revoke all on function public.release_account_usage_spend(uuid, bigint) from public;
grant execute on function public.reserve_account_usage_spend(uuid, bigint) to service_role;
grant execute on function public.confirm_account_usage_spend(uuid, bigint, bigint) to service_role;
grant execute on function public.release_account_usage_spend(uuid, bigint) to service_role;

alter table public.account_usage_periods enable row level security;

-- Users can read their own period spend; writes are service-role only.
drop policy if exists "account_usage_periods_select_own" on public.account_usage_periods;
create policy "account_usage_periods_select_own"
  on public.account_usage_periods for select
  using (profile_id = auth.uid());

grant select on public.account_usage_periods to authenticated;
grant all on public.account_usage_periods to service_role;
