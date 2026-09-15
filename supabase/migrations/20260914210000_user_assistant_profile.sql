-- Per-user conversational assistant profile (voice personality preferences).

create table if not exists public.user_assistant_profile (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_assistant_profile enable row level security;

drop policy if exists "user_assistant_profile_own" on public.user_assistant_profile;
create policy "user_assistant_profile_own"
  on public.user_assistant_profile for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop trigger if exists user_assistant_profile_updated_at on public.user_assistant_profile;
create trigger user_assistant_profile_updated_at
  before update on public.user_assistant_profile
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.user_assistant_profile to authenticated;
grant all on public.user_assistant_profile to service_role;
