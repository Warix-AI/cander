-- Persist full structured turn traces from Edge V2 orchestrator (dev/debug).

alter table public.ai_chat_turns
  add column if not exists structured_trace jsonb;

comment on column public.ai_chat_turns.structured_trace is
  'End-to-end structured JSON trace: user ask → retrieval → model → answer. Dev/debug only.';

create index if not exists ai_chat_turns_structured_trace_idx
  on public.ai_chat_turns (owner_id, created_at desc)
  where structured_trace is not null;
