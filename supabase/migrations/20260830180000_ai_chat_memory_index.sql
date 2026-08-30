-- Layered memory: cross-chat / Space retrieval index (owner-private, permission-aware).
-- Updated after each completed turn from conversation_state + chat metadata.

create table if not exists public.ai_chat_memory_index (
  chat_id text primary key references public.ai_chats (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text references public.workspaces (id) on delete set null,
  title text not null default 'New chat',
  summary text not null default '',
  entities text[] not null default '{}',
  topics text[] not null default '{}',
  project_ref_ids text[] not null default '{}',
  message_count integer not null default 0,
  last_message_at timestamptz,
  search_document tsvector,
  updated_at timestamptz not null default now()
);

create or replace function public.ai_chat_memory_index_search_doc(
  p_title text,
  p_summary text,
  p_entities text[],
  p_topics text[]
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('english', coalesce(p_title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(p_summary, '')), 'B')
    || setweight(
      to_tsvector('english', coalesce(array_to_string(p_entities, ' '), '')),
      'B'
    )
    || setweight(
      to_tsvector('english', coalesce(array_to_string(p_topics, ' '), '')),
      'C'
    );
$$;

create or replace function public.touch_ai_chat_memory_index_search()
returns trigger
language plpgsql
as $$
begin
  new.search_document := public.ai_chat_memory_index_search_doc(
    new.title,
    new.summary,
    new.entities,
    new.topics
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ai_chat_memory_index_search on public.ai_chat_memory_index;
create trigger ai_chat_memory_index_search
  before insert or update of title, summary, entities, topics
  on public.ai_chat_memory_index
  for each row execute function public.touch_ai_chat_memory_index_search();

create index if not exists ai_chat_memory_index_owner_idx
  on public.ai_chat_memory_index (owner_id, updated_at desc);

create index if not exists ai_chat_memory_index_workspace_idx
  on public.ai_chat_memory_index (owner_id, workspace_id, updated_at desc)
  where workspace_id is not null;

create index if not exists ai_chat_memory_index_fts_idx
  on public.ai_chat_memory_index using gin (search_document);

create index if not exists ai_chat_memory_index_entities_idx
  on public.ai_chat_memory_index using gin (entities);

alter table public.ai_chat_memory_index enable row level security;

drop policy if exists "ai_chat_memory_index_owner_select" on public.ai_chat_memory_index;
drop policy if exists "ai_chat_memory_index_owner_insert" on public.ai_chat_memory_index;
drop policy if exists "ai_chat_memory_index_owner_update" on public.ai_chat_memory_index;
drop policy if exists "ai_chat_memory_index_owner_delete" on public.ai_chat_memory_index;

create policy "ai_chat_memory_index_owner_select"
  on public.ai_chat_memory_index for select
  using (owner_id = auth.uid());

create policy "ai_chat_memory_index_owner_insert"
  on public.ai_chat_memory_index for insert
  with check (owner_id = auth.uid());

create policy "ai_chat_memory_index_owner_update"
  on public.ai_chat_memory_index for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "ai_chat_memory_index_owner_delete"
  on public.ai_chat_memory_index for delete
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.ai_chat_memory_index to authenticated;

comment on table public.ai_chat_memory_index is
  'Searchable cross-chat memory index: summaries, entities, topics, workspace/Space scope. Owner-private RLS.';
