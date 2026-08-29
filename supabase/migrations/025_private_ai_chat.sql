-- Cander: owner-private AI chat foundation
-- Chats are permanently private to the signed-in owner.
-- Workspace membership must NEVER grant access to these tables.

-- ── ai_chats ─────────────────────────────────────────────────────────────────
create table if not exists public.ai_chats (
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text references public.workspaces (id) on delete set null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chats_owner_updated_idx
  on public.ai_chats (owner_id, updated_at desc);

-- ── ai_chat_messages ─────────────────────────────────────────────────────────
create table if not exists public.ai_chat_messages (
  id text primary key,
  chat_id text not null references public.ai_chats (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null default '',
  status text not null default 'complete'
    check (status in ('complete', 'streaming', 'error', 'pending')),
  sort_order integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_chat_idx
  on public.ai_chat_messages (chat_id, sort_order);

create index if not exists ai_chat_messages_owner_idx
  on public.ai_chat_messages (owner_id);

-- ── ai_chat_context_refs ─────────────────────────────────────────────────────
create table if not exists public.ai_chat_context_refs (
  id text primary key,
  chat_id text not null references public.ai_chats (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text references public.workspaces (id) on delete set null,
  ref_kind text not null
    check (ref_kind in (
      'project', 'source', 'connector', 'automation', 'research', 'workspace'
    )),
  ref_id text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  unique (chat_id, ref_kind, ref_id)
);

create index if not exists ai_chat_context_refs_chat_idx
  on public.ai_chat_context_refs (chat_id);

-- ── ai_audit_events ──────────────────────────────────────────────────────────
create table if not exists public.ai_audit_events (
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  chat_id text references public.ai_chats (id) on delete set null,
  action text not null,
  provider text,
  status text not null default 'ok',
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_audit_events_owner_idx
  on public.ai_audit_events (owner_id, created_at desc);

-- ── Touch chat updated_at on message insert ──────────────────────────────────
create or replace function public.touch_ai_chat_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_chats
  set updated_at = now(),
      title = case
        when new.role = 'user'
          and (title = 'New chat' or title is null or title = '')
        then left(new.content, 80)
        else title
      end
  where id = new.chat_id
    and owner_id = new.owner_id;
  return new;
end;
$$;

drop trigger if exists ai_chat_messages_touch_chat on public.ai_chat_messages;
create trigger ai_chat_messages_touch_chat
  after insert on public.ai_chat_messages
  for each row execute function public.touch_ai_chat_on_message();

drop trigger if exists ai_chats_updated_at on public.ai_chats;
create trigger ai_chats_updated_at
  before update on public.ai_chats
  for each row execute function public.set_updated_at();

-- ── RLS: owner only (no workspace_members in policies) ───────────────────────
alter table public.ai_chats enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_chat_context_refs enable row level security;
alter table public.ai_audit_events enable row level security;

drop policy if exists "ai_chats_owner_select" on public.ai_chats;
drop policy if exists "ai_chats_owner_insert" on public.ai_chats;
drop policy if exists "ai_chats_owner_update" on public.ai_chats;
drop policy if exists "ai_chats_owner_delete" on public.ai_chats;

create policy "ai_chats_owner_select"
  on public.ai_chats for select
  using (owner_id = auth.uid());

create policy "ai_chats_owner_insert"
  on public.ai_chats for insert
  with check (owner_id = auth.uid());

create policy "ai_chats_owner_update"
  on public.ai_chats for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "ai_chats_owner_delete"
  on public.ai_chats for delete
  using (owner_id = auth.uid());

drop policy if exists "ai_chat_messages_owner_select" on public.ai_chat_messages;
drop policy if exists "ai_chat_messages_owner_insert" on public.ai_chat_messages;
drop policy if exists "ai_chat_messages_owner_update" on public.ai_chat_messages;
drop policy if exists "ai_chat_messages_owner_delete" on public.ai_chat_messages;

create policy "ai_chat_messages_owner_select"
  on public.ai_chat_messages for select
  using (owner_id = auth.uid());

create policy "ai_chat_messages_owner_insert"
  on public.ai_chat_messages for insert
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.ai_chats c
      where c.id = chat_id and c.owner_id = auth.uid()
    )
  );

create policy "ai_chat_messages_owner_update"
  on public.ai_chat_messages for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "ai_chat_messages_owner_delete"
  on public.ai_chat_messages for delete
  using (owner_id = auth.uid());

drop policy if exists "ai_chat_context_refs_owner_select" on public.ai_chat_context_refs;
drop policy if exists "ai_chat_context_refs_owner_insert" on public.ai_chat_context_refs;
drop policy if exists "ai_chat_context_refs_owner_update" on public.ai_chat_context_refs;
drop policy if exists "ai_chat_context_refs_owner_delete" on public.ai_chat_context_refs;

create policy "ai_chat_context_refs_owner_select"
  on public.ai_chat_context_refs for select
  using (owner_id = auth.uid());

create policy "ai_chat_context_refs_owner_insert"
  on public.ai_chat_context_refs for insert
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.ai_chats c
      where c.id = chat_id and c.owner_id = auth.uid()
    )
  );

create policy "ai_chat_context_refs_owner_update"
  on public.ai_chat_context_refs for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "ai_chat_context_refs_owner_delete"
  on public.ai_chat_context_refs for delete
  using (owner_id = auth.uid());

drop policy if exists "ai_audit_events_owner_select" on public.ai_audit_events;
drop policy if exists "ai_audit_events_owner_insert" on public.ai_audit_events;

create policy "ai_audit_events_owner_select"
  on public.ai_audit_events for select
  using (owner_id = auth.uid());

create policy "ai_audit_events_owner_insert"
  on public.ai_audit_events for insert
  with check (owner_id = auth.uid());

-- No update/delete on audit events for clients

grant select, insert, update, delete on public.ai_chats to authenticated;
grant select, insert, update, delete on public.ai_chat_messages to authenticated;
grant select, insert, update, delete on public.ai_chat_context_refs to authenticated;
grant select, insert on public.ai_audit_events to authenticated;
