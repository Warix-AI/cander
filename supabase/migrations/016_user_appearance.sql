-- Per-user appearance preferences (theme, typography, layout, etc.)

create table if not exists public.user_appearance (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  appearance jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_appearance enable row level security;

drop policy if exists "user_appearance_own" on public.user_appearance;
create policy "user_appearance_own"
  on public.user_appearance for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop trigger if exists user_appearance_updated_at on public.user_appearance;
create trigger user_appearance_updated_at
  before update on public.user_appearance
  for each row execute function public.set_updated_at();
