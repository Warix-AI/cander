-- Condensed context for private AI chats (incremental summary + watermark).
alter table public.ai_chats
  add column if not exists condensed_context jsonb,
  add column if not exists condensed_through_sort_order integer,
  add column if not exists condensed_at timestamptz;

comment on column public.ai_chats.condensed_context is
  'Structured long-term chat summary for model context; not shown to users by default.';
comment on column public.ai_chats.condensed_through_sort_order is
  'Highest ai_chat_messages.sort_order included in condensed_context.';
