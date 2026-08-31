-- Async GPT Image generation jobs (pollable; survives reload).
create table if not exists public.image_generation_jobs (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id text,
  message_id text,
  prompt text not null,
  status text not null
    check (status in ('generating', 'completed', 'failed', 'cancelled')),
  mime_type text,
  openai_file_id text,
  attachment_id text,
  -- Base64 payload without data: prefix (cleared after client fetch when possible)
  result_b64 text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists image_generation_jobs_user_status_idx
  on public.image_generation_jobs (user_id, status, created_at desc);

alter table public.image_generation_jobs enable row level security;

drop policy if exists image_generation_jobs_select_own on public.image_generation_jobs;
create policy image_generation_jobs_select_own
  on public.image_generation_jobs
  for select
  using (auth.uid() = user_id);

drop policy if exists image_generation_jobs_insert_own on public.image_generation_jobs;
create policy image_generation_jobs_insert_own
  on public.image_generation_jobs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists image_generation_jobs_update_own on public.image_generation_jobs;
create policy image_generation_jobs_update_own
  on public.image_generation_jobs
  for update
  using (auth.uid() = user_id);

grant select, insert, update on public.image_generation_jobs to authenticated;
grant all on public.image_generation_jobs to service_role;
