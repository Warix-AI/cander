-- Orphan Composio session_uri values captured when the OAuth verifier
-- redirect lands in an external browser without a Cander session cookie.
-- The signed-in Cander client claims these and completes verifyOAuthCallback.

create table if not exists public.connector_oauth_session_drops (
  id text primary key,
  session_uri text not null,
  session_uri_hash text not null unique,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null
);

create index if not exists connector_oauth_session_drops_open_idx
  on public.connector_oauth_session_drops (created_at desc)
  where claimed_at is null;

comment on table public.connector_oauth_session_drops is
  'Unauthenticated OAuth verifier hits; claimed by the signed-in Cander window.';

alter table public.connector_oauth_session_drops enable row level security;

revoke all on table public.connector_oauth_session_drops from anon, authenticated;
-- Service role / admin client only.
