-- Auth / signup attribution events — IP, UA, referrer, UTMs, geo headers.
-- Service-role write only (via /api/auth/events). Platform admin read via admin APIs.

create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (
      event_type in (
        'visit',
        'signup_started',
        'signup_created',
        'signup_existing',
        'email_verified',
        'signed_in',
        'onboarding_completed',
        'password_reset_requested'
      )
    ),
  profile_id uuid references public.profiles (id) on delete set null,
  email text,
  provider text,
  ip inet,
  user_agent text,
  accept_language text,
  referrer text,
  landing_url text,
  landing_path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  gclid text,
  fbclid text,
  timezone text,
  locale text,
  screen_width integer,
  screen_height integer,
  geo_country text,
  geo_region text,
  geo_city text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auth_events_created_idx
  on public.auth_events (created_at desc);

create index if not exists auth_events_profile_idx
  on public.auth_events (profile_id, created_at desc)
  where profile_id is not null;

create index if not exists auth_events_email_idx
  on public.auth_events (lower(email), created_at desc)
  where email is not null;

create index if not exists auth_events_type_idx
  on public.auth_events (event_type, created_at desc);

create index if not exists auth_events_ip_idx
  on public.auth_events (ip, created_at desc)
  where ip is not null;

comment on table public.auth_events is
  'Append-only acquisition / auth funnel events (IP, UA, referrer, UTMs, geo).';

alter table public.auth_events enable row level security;

revoke all on public.auth_events from authenticated, anon;
grant select, insert on public.auth_events to service_role;
