-- Cross-client notifications: records, endpoints, deliveries, preferences.

-- ── notifications (shared history for all clients) ───────────────────────────
create table if not exists public.notifications (
  id text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  type text not null,
  title text not null default '',
  body text not null default '',
  connector text,
  connection_id text,
  resource_type text,
  resource_id text,
  route text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_profile_dedupe_uidx
  on public.notifications (profile_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists notifications_profile_created_idx
  on public.notifications (profile_id, created_at desc);

create index if not exists notifications_profile_unread_idx
  on public.notifications (profile_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_own_select" on public.notifications;
create policy "notifications_own_select"
  on public.notifications for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update"
  on public.notifications for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Clients do not insert/delete notification rows (server/service role only).
revoke insert, delete on public.notifications from authenticated;
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- ── notification_endpoints (Capacitor / Electron / Web Push) ─────────────────
create table if not exists public.notification_endpoints (
  id text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  client_type text not null
    check (client_type in (
      'capacitor_ios',
      'capacitor_android',
      'electron',
      'web'
    )),
  endpoint_type text not null
    check (endpoint_type in (
      'apns',
      'fcm',
      'web_push',
      'realtime_session'
    )),
  device_id text not null,
  push_token text,
  push_subscription jsonb,
  app_version text,
  environment text not null default 'production'
    check (environment in ('development', 'production')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_endpoints_install_uidx
  on public.notification_endpoints (profile_id, client_type, device_id);

create unique index if not exists notification_endpoints_token_uidx
  on public.notification_endpoints (endpoint_type, push_token)
  where push_token is not null and push_token <> '';

create index if not exists notification_endpoints_profile_enabled_idx
  on public.notification_endpoints (profile_id, enabled);

alter table public.notification_endpoints enable row level security;

drop policy if exists "notification_endpoints_own" on public.notification_endpoints;
create policy "notification_endpoints_own"
  on public.notification_endpoints for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop trigger if exists notification_endpoints_updated_at
  on public.notification_endpoints;
create trigger notification_endpoints_updated_at
  before update on public.notification_endpoints
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.notification_endpoints to authenticated;
grant all on public.notification_endpoints to service_role;

-- ── notification_deliveries (per endpoint/channel attempts) ──────────────────
create table if not exists public.notification_deliveries (
  id text primary key,
  notification_id text not null
    references public.notifications (id) on delete cascade,
  endpoint_id text
    references public.notification_endpoints (id) on delete set null,
  channel text not null
    check (channel in (
      'mobile_push',
      'electron_notification',
      'web_push',
      'in_app'
    )),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'suppressed')),
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  error text
);

create unique index if not exists notification_deliveries_endpoint_channel_uidx
  on public.notification_deliveries (notification_id, endpoint_id, channel)
  where endpoint_id is not null;

create unique index if not exists notification_deliveries_in_app_uidx
  on public.notification_deliveries (notification_id, channel)
  where channel = 'in_app';

create index if not exists notification_deliveries_notification_idx
  on public.notification_deliveries (notification_id);

alter table public.notification_deliveries enable row level security;

-- Deliveries are server-written; owners may read own via join ownership.
drop policy if exists "notification_deliveries_own_select"
  on public.notification_deliveries;
create policy "notification_deliveries_own_select"
  on public.notification_deliveries for select
  to authenticated
  using (
    exists (
      select 1 from public.notifications n
      where n.id = notification_id
        and n.profile_id = auth.uid()
    )
  );

revoke insert, update, delete on public.notification_deliveries from authenticated;
grant select on public.notification_deliveries to authenticated;
grant all on public.notification_deliveries to service_role;

-- ── notification_preferences ─────────────────────────────────────────────────
create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  prefs jsonb not null default jsonb_build_object(
    'global_enabled', true,
    'channels', jsonb_build_object(
      'mobile_push', true,
      'electron_notification', true,
      'web_push', false,
      'in_app', true
    ),
    'types', jsonb_build_object(
      'connector.gmail.new_email', true
    ),
    'connectors', '{}'::jsonb,
    'connections', '{}'::jsonb
  ),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_own"
  on public.notification_preferences;
create policy "notification_preferences_own"
  on public.notification_preferences for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop trigger if exists notification_preferences_updated_at
  on public.notification_preferences;
create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

-- Realtime: live in-app / Electron / open Capacitor sessions
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
