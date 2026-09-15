-- Expert Projects: voice toggle, locked model, delivery preference stub.

alter table public.project_agents
  add column if not exists voice_enabled boolean not null default false;

alter table public.project_agents
  add column if not exists model_id text not null default 'gpt-5.6-luna';

alter table public.project_agents
  add column if not exists delivery jsonb not null default '{"channels":["expert_chat","overview"]}'::jsonb;

-- Optional linkage from a run to the AI minutes execution for Overview.
alter table public.agent_runs
  add column if not exists ai_execution_id text;

alter table public.agent_runs
  add column if not exists active_duration_ms integer;

comment on column public.project_agents.voice_enabled is
  'When true, Expert supports Live voice alongside chat.';
comment on column public.project_agents.model_id is
  'Locked Expert execution model (gpt-5.6-luna). Not user-editable.';
comment on column public.project_agents.delivery is
  'Delivery channels stub: expert_chat/overview now; email/PDF later.';
