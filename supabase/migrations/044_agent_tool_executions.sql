-- Tool execution idempotency + connector_tool event kind for agent runtime.

-- ── Idempotent write executions ──────────────────────────────────────────────
create table if not exists public.tool_executions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  chat_id text,
  turn_id text,
  tool_id text not null,
  connection_id text,
  tool_call_id text not null,
  idempotency_key text not null,
  status text not null check (status in ('pending', 'success', 'error', 'denied')),
  arguments jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index if not exists tool_executions_owner_created_idx
  on public.tool_executions (owner_id, created_at desc);

create index if not exists tool_executions_workspace_idx
  on public.tool_executions (workspace_id, created_at desc);

alter table public.tool_executions enable row level security;

drop policy if exists "tool_executions_owner_select" on public.tool_executions;
drop policy if exists "tool_executions_owner_insert" on public.tool_executions;
drop policy if exists "tool_executions_owner_update" on public.tool_executions;

create policy "tool_executions_owner_select"
  on public.tool_executions for select
  using (owner_id = auth.uid());

create policy "tool_executions_owner_insert"
  on public.tool_executions for insert
  with check (owner_id = auth.uid());

create policy "tool_executions_owner_update"
  on public.tool_executions for update
  using (owner_id = auth.uid());

-- ── Allow connector_tool kind on ai_chat_turn_events ───────────────────────
alter table public.ai_chat_turn_events
  drop constraint if exists ai_chat_turn_events_kind_check;

alter table public.ai_chat_turn_events
  add constraint ai_chat_turn_events_kind_check
  check (kind in (
    'web_search',
    'knowledge',
    'client_action',
    'retrieval',
    'planner',
    'status',
    'connector_tool'
  ));
