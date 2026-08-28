-- Track whether the user finished the in-app onboarding flow (plan, profile, connectors).
-- Distinct from handle_new_user(), which seeds a default workspace on signup.

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

-- Existing accounts that already finished profile setup keep access.
update public.profiles
set onboarding_completed_at = coalesce(updated_at, created_at)
where onboarding_completed_at is null
  and short_name is not null
  and btrim(short_name) <> '';
