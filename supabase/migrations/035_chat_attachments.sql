-- Chat attachments for RAW OpenAI multimodal (openai_file_id persistence).
-- thread_id is soft (no FK): composer can stage uploads before the thread
-- row exists in Supabase. message_id stays nullable for pending → attached.

create table if not exists public.chat_attachments (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id text,
  message_id text,
  filename text not null,
  mime_type text not null,
  size bigint not null check (size >= 0),
  attachment_type text not null check (attachment_type in ('image', 'document', 'audio')),
  openai_file_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'attached', 'failed')),
  created_at timestamptz not null default now()
);

-- Idempotent upgrades if an older draft of this table already exists.
alter table public.chat_attachments
  add column if not exists status text;

update public.chat_attachments
set status = 'pending'
where status is null;

alter table public.chat_attachments
  alter column status set default 'pending';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_attachments'
      and column_name = 'status'
  ) then
    begin
      alter table public.chat_attachments
        alter column status set not null;
    exception when others then
      null;
    end;
  end if;
end $$;

-- Drop hard thread FK if a prior revision created one (local-only threads).
do $$
declare
  fk_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'chat_attachments'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'thread_id'
  limit 1;
  if fk_name is not null then
    execute format(
      'alter table public.chat_attachments drop constraint %I',
      fk_name
    );
  end if;
end $$;

create index if not exists chat_attachments_user_thread_idx
  on public.chat_attachments (user_id, thread_id, created_at desc);

create index if not exists chat_attachments_openai_file_idx
  on public.chat_attachments (openai_file_id);

create index if not exists chat_attachments_message_idx
  on public.chat_attachments (message_id)
  where message_id is not null;

create index if not exists chat_attachments_status_idx
  on public.chat_attachments (user_id, status);

alter table public.chat_attachments enable row level security;

drop policy if exists "chat_attachments_select_owner" on public.chat_attachments;
create policy "chat_attachments_select_owner"
  on public.chat_attachments for select
  using (user_id = auth.uid());

drop policy if exists "chat_attachments_insert_owner" on public.chat_attachments;
create policy "chat_attachments_insert_owner"
  on public.chat_attachments for insert
  with check (user_id = auth.uid());

drop policy if exists "chat_attachments_update_owner" on public.chat_attachments;
create policy "chat_attachments_update_owner"
  on public.chat_attachments for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "chat_attachments_delete_owner" on public.chat_attachments;
create policy "chat_attachments_delete_owner"
  on public.chat_attachments for delete
  using (user_id = auth.uid());

grant select, insert, update, delete on public.chat_attachments to authenticated;
grant all on public.chat_attachments to service_role;
