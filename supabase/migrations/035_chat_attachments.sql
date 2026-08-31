-- Chat attachments for RAW OpenAI multimodal (openai_file_id persistence).

create table if not exists public.chat_attachments (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id text references public.threads (id) on delete cascade,
  message_id text references public.messages (id) on delete set null,
  filename text not null,
  mime_type text not null,
  size bigint not null check (size >= 0),
  attachment_type text not null check (attachment_type in ('image', 'document', 'audio')),
  openai_file_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_attachments_user_thread_idx
  on public.chat_attachments (user_id, thread_id, created_at desc);

create index if not exists chat_attachments_openai_file_idx
  on public.chat_attachments (openai_file_id);

create index if not exists chat_attachments_message_idx
  on public.chat_attachments (message_id)
  where message_id is not null;

alter table public.chat_attachments enable row level security;

create policy "chat_attachments_select_owner"
  on public.chat_attachments for select
  using (user_id = auth.uid());

create policy "chat_attachments_insert_owner"
  on public.chat_attachments for insert
  with check (user_id = auth.uid());

create policy "chat_attachments_update_owner"
  on public.chat_attachments for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "chat_attachments_delete_owner"
  on public.chat_attachments for delete
  using (user_id = auth.uid());

grant select, insert, update, delete on public.chat_attachments to authenticated;
