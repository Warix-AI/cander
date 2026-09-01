# Supabase runbook

How to run Cander against Supabase (staging or production).

## Prerequisites

- Supabase project created
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed (`supabase --version`)
- `.env.local` copied from `.env.example`

## Environment

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role>   # server/CLI only — never expose to client
NEXT_PUBLIC_DATA_BACKEND=supabase
```

Local mock mode (default):

```bash
NEXT_PUBLIC_DATA_BACKEND=local
# Supabase vars optional
```

Add auth redirect URLs in Supabase dashboard (Authentication → URL configuration):

- `http://localhost:3000/auth/callback`
- `https://cander.app/auth/callback`
- Preview deploys: `https://*.vercel.app/auth/callback` (or the specific PR preview origin)

Site URL should be `https://cander.app` in production.

## Migrations (order matters)

Apply in sequence:

| File | Phase |
|------|-------|
| `001_tenancy.sql` | Auth + workspaces |
| `002_space_entities.sql` | Projects, sources, briefing |
| `003_chat.sql` | Threads + messages |
| `004_org_policy.sql` | Policy, pins, sidebar |
| `005_connectors.sql` | Connector catalog + installs |
| `006_build_browser.sql` | Project files + browser sessions |
| `009_org_onboarding.sql` | Org setup RPC + invites |
| `010_billing.sql` | Subscription columns |
| `011_billing_period_end.sql` | Period end / cancel flags |
| `012_profiles_grants.sql` | Grants + workspace_members RLS fix |
| `013_profile_short_name.sql` | Preferred short name on profiles |
| `014_workspace_delete.sql` | Owner can delete workspaces |
| `015_onboarding_completed.sql` | Gate app until onboarding finish |
| `016_user_appearance.sql` | Per-user appearance preferences |
| `017_invite_onboarding.sql` | Invited users skip onboarding gate |
| `018_workspace_invites.sql` | Pending workspace invites + org admin auto-add trigger |
| `019_managed_profile_rls.sql` | Managed org members: profile updates limited to `short_name` |
| `020_entity_created_by.sql` | `created_by` on projects, sources, project_files |
| `021_project_browser_tabs.sql` | Browser tabs persistence |
| `022_workspace_isolation_hardening.sql` | Workspace isolation |
| `023_security_hardening.sql` | Security hardening |
| `024_project_title_unique.sql` | Unique project titles |
| `025_private_ai_chat.sql` | Owner-private AI chats, messages, context refs, audit |
| `037_image_generation_jobs.sql` | Async image generation job ledger |
| `038_usage_protection.sql` | Usage events, window counters, audit log |
| `039_connector_hardening.sql` | Owner-scoped connector connections, audit, RLS |
| `040_connector_composio_prep.sql` | OAuth states, webhook receipts, reconcile RPC, client promotion block |
| `041_connector_oauth_resilience.sql` | OAuth lifecycle leases, atomic callback completion RPC, hardened reconcile |

### Connector migration 040 rollback (staging only)

`040_connector_composio_prep.sql` adds server-only tables and a security-definer RPC. Roll back only on staging with explicit approval:

```sql
drop function if exists public.reconcile_connector_connection(text, text, text, text, text);
drop trigger if exists connector_connections_block_client_promotion on public.connector_connections;
drop function if exists public.connector_connections_block_client_promotion();
drop table if exists public.connector_webhook_receipts;
drop table if exists public.connector_oauth_states;
alter table public.connector_connections drop column if exists composio_user_id;
```

Re-apply with `supabase db push` when ready.

### Connector migration 041 rollback (staging only)

`041_connector_oauth_resilience.sql` adds OAuth lifecycle columns and callback RPCs. Roll back only on staging with explicit approval:

```sql
drop function if exists public.list_recoverable_connector_oauth_states(integer);
drop function if exists public.release_expired_connector_oauth_processing(text);
drop function if exists public.fail_connector_oauth_state(text, uuid, text);
drop function if exists public.complete_connector_oauth_callback(text, uuid, text, text);
drop function if exists public.record_connector_oauth_verification(text, uuid, text);
drop function if exists public.claim_connector_oauth_state_for_callback(uuid, integer);
-- reconcile_connector_connection is replaced; re-apply 040 to restore prior version if needed
alter table public.connector_oauth_states
  drop column if exists lifecycle_status,
  drop column if exists processing_started_at,
  drop column if exists processing_expires_at,
  drop column if exists verified_provider_connection_id,
  drop column if exists failure_detail;
```

Re-apply with `supabase db push` when ready.

### Composio (server env)

See `docs/connectors/composio-integration.md` and `docs/connectors/gmail-pilot-checklist.md`.

- `COMPOSIO_API_KEY`
- `COMPOSIO_GMAIL_AUTH_CONFIG_ID`
- `COMPOSIO_WEBHOOK_SECRET`
- `COMPOSIO_CALLBACK_VERIFIER_URL` (must match Composio dashboard verifier URL exactly)

Webhook URL: `https://<host>/api/connectors/webhooks/composio`

```bash
supabase link --project-ref <ref>
supabase db push
# or fresh local stack:
supabase start && supabase db reset
```

Optional demo seed:

```bash
supabase db execute --file supabase/seed.sql
```

## Edge Functions

Deploy after migrations:

```bash
supabase functions deploy chat-send
supabase functions deploy briefing-sync
supabase functions deploy build-publish
supabase functions deploy ai-chat
```

Private AI chat (`ai-chat`) requires Edge secrets `CANDER_AI_BRIDGE_URL` (HTTPS tunnel) and `CANDER_AI_BRIDGE_SECRET`. See [ai-bridge.md](./ai-bridge.md).

## App

```bash
npm install
npm run dev
```

Sign up / sign in with email + password. Live accounts start empty (no sample data import).

## Signup → plan → nav

Onboarding writes `profiles.plan` (and `short_name` when migration 013 is applied) and grants nav spaces on the personal workspace created by `handle_new_user`.

| Plan | `Member.kind` | Default nav | Notes |
|------|---------------|-------------|-------|
| `free` | personal | Yes | Unlimited private usage; 1 workspace |
| `pro` | personal | Yes | Voice, more workspaces, APIs |
| `max` | org when team | Yes | Work space, shared workspaces, team admin |

All plans support **personal and business** workspaces equally.

**iOS:** Sign up in the app (starts on Free). Settings → Plan shows current plan only; **View subscription** opens `/pricing` in Safari for upgrades (no IAP).

Nav visibility uses `memberSpaces(workspaceId, actorId)` — not plan alone.

### Max organization onboarding (web)

After choosing **Max**, onboarding forks: **Personal**, **Set up organization**, or **Set up later**. Org setup collects org name and optional Pro/Max invites; it is always skippable.

When Stripe keys are **not** configured, Pro/Max checkout returns `{ bypass: true }` and unlocks the plan for testing without charging. When Stripe **is** configured, paid plans go through Checkout and resume via `/?onboarding=resume`.

Invite emails send when `RESEND_API_KEY` is set; otherwise invite rows are created and shareable links are returned.

When org setup completes with Supabase configured, `setup_org_onboarding` (migration `009`) creates an `organizations` row, links the workspace, upserts the owner in `org_members`, and inserts pending invite rows.

Apply `009_org_onboarding.sql` and `010_billing.sql` before testing org invites and paid onboarding:

```bash
supabase db push
```

### Paid onboarding (Stripe)

| Plan | Checkout | Resume step |
|------|----------|-------------|
| Free | None | Connectors |
| Pro | After plan Continue | First workspace |
| Max | After plan Continue | How will you use Max |

Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_MAX`. Optional: `RESEND_API_KEY` for org invite emails.

Webhook endpoint: `POST /api/stripe/webhook`. Local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

`profiles.subscription_status` gates Pro/Max entitlements until checkout completes. Org invitees accept at `/invite/{token}` — pre-filled name/email/plan, password only, then seat bills owner subscription (prorated).

Managed org members (`org_members.role != Owner`) cannot delete their account — sign out only.

**Organization permissions:** Workspace assignment sends pending invites (Settings → Organization → user detail, or Settings → Workspaces → Invite member). Org admins are auto-added to member workspaces via trigger in `018`.

| Path | `Member.kind` | Organization tab |
|------|---------------|-------------------|
| Max personal | personal | Hidden |
| Max org now | org (Owner) | Admin — invites, seat mix |
| Max org later | personal + `orgSetupDeferred` | Admin — finish setup CTA |
| Pro/Max org member | org | Managed by — read-only |

If Connectors / spaces are missing after sign-in: hard-refresh once after `007` is applied, or clear `courier-workspace` and reload so hydrate can switch to `ws-<userid>`.

## Auth checklist

- [ ] Sign up / sign in (email + password)
- [ ] **Email verify (OTP):** Create account → Check your email → enter 6-digit code → continue onboarding
- [ ] Email verify via **link** also works (`/auth/callback`) and resumes onboarding
- [ ] Log out (Settings or account menu) clears Supabase session
- [ ] Delete account requires `SUPABASE_SERVICE_ROLE_KEY` on the server (`/api/account/delete`)
- [ ] Forgot password → email link → `/auth/callback?next=/auth/reset` → set password
- [ ] Change email in Settings → confirm via email link
- [ ] OAuth: enable Google / Apple in Supabase → Authentication → Providers (skips email verify)
- [ ] Redirect URLs include `{APP_ORIGIN}/auth/callback` (and `/auth/reset` as needed)

### Confirm signup email template (OTP)

In Supabase → **Authentication → Email Templates → Confirm signup**, include the code so the in-app verify screen works:

```html
<p>Your Cander code is: <strong>{{ .Token }}</strong></p>
<p>Or confirm here: <a href="{{ .ConfirmationURL }}">Verify email</a></p>
```

Enable **Confirm email** under Authentication → Providers → Email. Without `{{ .Token }}` in the template, users only get a link (still works; OTP field will fail until the template is updated).

## Verification checklist

- [ ] Sign up creates profile + personal workspace (trigger in `001` / `007`)
- [ ] Sidebar shows Work, Build, Explore, Connectors after signup
- [ ] `profiles.plan` matches the plan chosen in onboarding
- [ ] Work/Build dashboards load projects from Supabase
- [ ] Chat threads persist across refresh
- [ ] Settings: role/space toggles survive refresh (Organization → Manage access)
- [ ] Appearance: theme persists across sign-out / second browser (migration `016`)
- [ ] Workspace invite: assign from org user detail → invitee sees Pending in Settings → Workspaces → Approve → workspace in rail
- [ ] Workspace invite deny removes pending row; guest members cannot edit workspace settings
- [ ] Managed org member: org tab read-only; only short name editable; no email/delete/cancel billing
- [ ] Org Users list → user detail screen → manage access, plan, remove
- [ ] Shared business workspace recents show creator tag on threads/projects
- [ ] Connectors: install + work stack sync
- [ ] Publish in Build creates deployment row + updates project URL
- [ ] Browser URL persists per workspace

## CI

GitHub Actions workflow `.github/workflows/supabase-ci.yml` validates migration file order on every PR.

## Dual mode

Every feature must work with `NEXT_PUBLIC_DATA_BACKEND=local` for offline demos. Supabase mode is opt-in via env.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Missing Connectors / space links | Apply `007`; confirm `workspace_members.spaces` includes `connectors`; hydrate must run (AuthProvider) |
| Stuck on seed workspace (marketing, etc.) | Clear `courier-workspace` localStorage or re-sign-in so hydrate switches to `ws-*` |
| RLS denied | Confirm user is `workspace_members` row for target workspace |
| Empty data after login | Check import flags in localStorage (`courier-*-imported-v1`) |
| Edge function 401 | Confirm session cookie; add Authorization header from client invoke |
| Realtime not updating | Enable tables in Supabase Realtime publication (migrations add these) |
