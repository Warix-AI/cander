-- Cander Phase 2: threads + messages
-- Run after 001_tenancy.sql

-- ── Threads ──────────────────────────────────────────────────────────────────
create table if not exists public.threads (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  space_id text,
  project_id text,
  title text not null default 'Chat',
  snippet text not null default '',
  shared boolean not null default false,
  persistent boolean not null default false,
  session_summary text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists threads_workspace_idx
  on public.threads (workspace_id, updated_at desc);

create index if not exists threads_project_idx
  on public.threads (workspace_id, project_id)
  where project_id is not null;

-- ── Messages ─────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id text primary key,
  thread_id text not null references public.threads (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  at_label text not null default '',
  blocks jsonb,
  space_switch jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_idx
  on public.messages (thread_id, sort_order);

-- Full-text search (optional — used by Recents search later)
create index if not exists threads_title_search_idx
  on public.threads using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(snippet, '')));

-- ── updated_at trigger ───────────────────────────────────────────────────────
drop trigger if exists threads_updated_at on public.threads;
create trigger threads_updated_at
  before update on public.threads
  for each row execute function public.set_updated_at();

-- Bump thread.updated_at when a message is inserted
create or replace function public.touch_thread_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.threads
  set updated_at = now(),
      snippet = case
        when new.role = 'user' then left(new.content, 200)
        else snippet
      end
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_thread on public.messages;
create trigger messages_touch_thread
  after insert on public.messages
  for each row execute function public.touch_thread_on_message();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.threads enable row level security;
alter table public.messages enable row level security;

create policy "threads_select_member"
  on public.threads for select
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "threads_insert_member"
  on public.threads for insert
  with check (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "threads_update_member"
  on public.threads for update
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "threads_delete_member"
  on public.threads for delete
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "messages_select_member"
  on public.messages for select
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "messages_insert_member"
  on public.messages for insert
  with check (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "messages_update_member"
  on public.messages for update
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

-- Realtime (multi-tab sync)
alter publication supabase_realtime add table public.threads;
alter publication supabase_realtime add table public.messages;
