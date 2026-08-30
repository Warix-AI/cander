-- Web research: durable cache, usage quotas, and message citations (Exa migration).
-- Cache/usage are Edge/service-role only. Citations ride on message rows for reload survival.

-- ── Citations on message tables ───────────────────────────────────────────────
alter table public.ai_chat_messages
  add column if not exists citations jsonb not null default '[]'::jsonb;

alter table public.messages
  add column if not exists citations jsonb not null default '[]'::jsonb;

comment on column public.ai_chat_messages.citations is
  'Normalized WebSource[] for web-grounded assistant replies. Not visible message text.';
comment on column public.messages.citations is
  'Normalized WebSource[] mirrored for UI transcript reload (Electron/Capacitor/web).';

-- ── Durable Exa/web-research cache ───────────────────────────────────────────
create table if not exists public.web_research_cache (
  cache_key text primary key,
  provider text not null check (provider in ('exa', 'brave')),
  mode text not null check (mode in ('search', 'contents', 'deep')),
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists web_research_cache_expires_idx
  on public.web_research_cache (expires_at);

alter table public.web_research_cache enable row level security;

-- No authenticated policies — Edge uses service role only.
revoke all on public.web_research_cache from authenticated, anon;
grant select, insert, update, delete on public.web_research_cache to service_role;

-- ── Per-user / workspace usage windows ───────────────────────────────────────
create table if not exists public.web_research_usage (
  id bigserial primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  /** Empty string = no workspace scope (avoids NULL unique issues). */
  workspace_id text not null default '',
  window_kind text not null check (window_kind in ('minute', 'day')),
  window_start timestamptz not null,
  search_count integer not null default 0,
  contents_count integer not null default 0,
  deep_count integer not null default 0,
  cost_dollars_micros bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (owner_id, workspace_id, window_kind, window_start)
);

create index if not exists web_research_usage_owner_window_idx
  on public.web_research_usage (owner_id, window_kind, window_start desc);

alter table public.web_research_usage enable row level security;

create policy "web_research_usage_owner_select"
  on public.web_research_usage for select
  using (auth.uid() = owner_id);

revoke insert, update, delete on public.web_research_usage from authenticated, anon;
grant select on public.web_research_usage to authenticated;
grant select, insert, update, delete on public.web_research_usage to service_role;
grant usage, select on sequence public.web_research_usage_id_seq to service_role;

-- ── Optional diagnostics (no page bodies / secrets) ──────────────────────────
create table if not exists public.web_research_events (
  id bigserial primary key,
  owner_id uuid references public.profiles (id) on delete set null,
  workspace_id text references public.workspaces (id) on delete set null,
  provider text not null,
  mode text not null,
  status text not null,
  request_id text,
  exa_request_id text,
  latency_ms integer,
  result_count integer,
  cost_dollars_micros bigint,
  error_class text,
  created_at timestamptz not null default now()
);

create index if not exists web_research_events_created_idx
  on public.web_research_events (created_at desc);

alter table public.web_research_events enable row level security;

revoke all on public.web_research_events from authenticated, anon;
grant select, insert on public.web_research_events to service_role;
grant usage, select on sequence public.web_research_events_id_seq to service_role;
