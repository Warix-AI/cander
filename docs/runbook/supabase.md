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

Add auth redirect URL in Supabase dashboard:

- `http://localhost:3000/auth/callback`

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
```

## App

```bash
npm install
npm run dev
```

Sign up / sign in → first session imports localStorage into Postgres, then clears legacy auth keys.

## Verification checklist

- [ ] Sign up creates profile + personal workspace (trigger in `001`)
- [ ] Work/Build dashboards load projects from Supabase
- [ ] Chat threads persist across refresh
- [ ] Settings: role/space toggles survive refresh
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
| RLS denied | Confirm user is `workspace_members` row for target workspace |
| Empty data after login | Check import flags in localStorage (`courier-*-imported-v1`) |
| Edge function 401 | Confirm session cookie; add Authorization header from client invoke |
| Realtime not updating | Enable tables in Supabase Realtime publication (migrations add these) |
