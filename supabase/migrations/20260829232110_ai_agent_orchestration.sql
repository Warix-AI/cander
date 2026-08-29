-- AI Turn Orchestrator: turn-scoped search/events, conversation_state, idempotency.

-- ── ai_chats: durable conversation memory pointers ───────────────────────────
alter table public.ai_chats
  add column if not exists conversation_state jsonb not null default '{}'::jsonb,
  add column if not exists last_search_session_id uuid;

comment on column public.ai_chats.conversation_state is
  'Structured topics/entities/facts/references; async-updated after turns.';
comment on column public.ai_chats.last_search_session_id is
  'Lightweight pointer to the most recent ai_chat_search_sessions row.';

-- ── Turn-scoped search sessions (not one global overwrite) ───────────────────
create table if not exists public.ai_chat_search_sessions (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null references public.ai_chats (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  originating_message_id text references public.ai_chat_messages (id) on delete set null,
  turn_id uuid,
  queries jsonb not null default '[]'::jsonb,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_search_sessions_chat_idx
  on public.ai_chat_search_sessions (chat_id, created_at desc);

create index if not exists ai_chat_search_sessions_turn_idx
  on public.ai_chat_search_sessions (turn_id)
  where turn_id is not null;

alter table public.ai_chats
  drop constraint if exists ai_chats_last_search_session_id_fkey;
alter table public.ai_chats
  add constraint ai_chats_last_search_session_id_fkey
  foreign key (last_search_session_id)
  references public.ai_chat_search_sessions (id)
  on delete set null;

-- ── Structured tool/retrieval events (never fake user/assistant rows) ────────
create table if not exists public.ai_chat_turn_events (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null references public.ai_chats (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  turn_id uuid not null,
  message_id text references public.ai_chat_messages (id) on delete set null,
  kind text not null check (kind in (
    'web_search', 'knowledge', 'client_action', 'retrieval', 'planner', 'status'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_turn_events_chat_turn_idx
  on public.ai_chat_turn_events (chat_id, turn_id, created_at);

create index if not exists ai_chat_turn_events_turn_idx
  on public.ai_chat_turn_events (turn_id);

-- ── Idempotent / cancellable turns ───────────────────────────────────────────
create table if not exists public.ai_chat_turns (
  turn_id uuid primary key,
  chat_id text not null references public.ai_chats (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in (
      'pending', 'running', 'completed', 'failed', 'cancelled'
    )),
  cancel_requested boolean not null default false,
  user_message_id text references public.ai_chat_messages (id) on delete set null,
  assistant_message_id text references public.ai_chat_messages (id) on delete set null,
  route_decision text,
  failure_stage text,
  observability jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_chat_turns_chat_idx
  on public.ai_chat_turns (chat_id, created_at desc);

create index if not exists ai_chat_turns_owner_status_idx
  on public.ai_chat_turns (owner_id, status);

-- ── RLS (owner-private, same model as ai_chats) ──────────────────────────────
alter table public.ai_chat_search_sessions enable row level security;
alter table public.ai_chat_turn_events enable row level security;
alter table public.ai_chat_turns enable row level security;

drop policy if exists "ai_chat_search_sessions_owner_select" on public.ai_chat_search_sessions;
drop policy if exists "ai_chat_search_sessions_owner_insert" on public.ai_chat_search_sessions;
drop policy if exists "ai_chat_search_sessions_owner_update" on public.ai_chat_search_sessions;
drop policy if exists "ai_chat_search_sessions_owner_delete" on public.ai_chat_search_sessions;

create policy "ai_chat_search_sessions_owner_select"
  on public.ai_chat_search_sessions for select
  using (owner_id = auth.uid());
create policy "ai_chat_search_sessions_owner_insert"
  on public.ai_chat_search_sessions for insert
  with check (owner_id = auth.uid());
create policy "ai_chat_search_sessions_owner_update"
  on public.ai_chat_search_sessions for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy "ai_chat_search_sessions_owner_delete"
  on public.ai_chat_search_sessions for delete
  using (owner_id = auth.uid());

drop policy if exists "ai_chat_turn_events_owner_select" on public.ai_chat_turn_events;
drop policy if exists "ai_chat_turn_events_owner_insert" on public.ai_chat_turn_events;
drop policy if exists "ai_chat_turn_events_owner_delete" on public.ai_chat_turn_events;

create policy "ai_chat_turn_events_owner_select"
  on public.ai_chat_turn_events for select
  using (owner_id = auth.uid());
create policy "ai_chat_turn_events_owner_insert"
  on public.ai_chat_turn_events for insert
  with check (owner_id = auth.uid());
create policy "ai_chat_turn_events_owner_delete"
  on public.ai_chat_turn_events for delete
  using (owner_id = auth.uid());

drop policy if exists "ai_chat_turns_owner_select" on public.ai_chat_turns;
drop policy if exists "ai_chat_turns_owner_insert" on public.ai_chat_turns;
drop policy if exists "ai_chat_turns_owner_update" on public.ai_chat_turns;

create policy "ai_chat_turns_owner_select"
  on public.ai_chat_turns for select
  using (owner_id = auth.uid());
create policy "ai_chat_turns_owner_insert"
  on public.ai_chat_turns for insert
  with check (owner_id = auth.uid());
create policy "ai_chat_turns_owner_update"
  on public.ai_chat_turns for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
