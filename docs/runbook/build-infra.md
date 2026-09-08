# Build infrastructure (Warix-managed)

Cander Apps and Websites provision durable code and runtime resources **under the Warix organization**. End users never connect their own GitHub, Vercel, or Supabase accounts for Build.

Product UX (create project, Build panel, Publish, Domains) stays the same. This stack runs behind those flows via **server-side APIs/SDKs** — not local `gh` or Vercel CLI sessions.

## Layers

| Layer | Role | Integration |
|-------|------|-------------|
| GitHub (Warix org) | Durable source of truth | GitHub App + Octokit (`@octokit/app`) |
| Vercel Sandbox | Disposable build/runtime | `@vercel/sandbox` + `VERCEL_TOKEN` / OIDC |
| Supabase (Warix org) | Per-app persistent backend | Management API (Phase 4) |
| Vercel Deployments | Published hosting | REST Deployments/Domains API (Phase 7+) |
| `*.cander.app` | Friendly URLs | Subdomain on `projects` + edge proxy (Phase 5/8) |

## Required server env

See `.env.example` section **Build infra**.

### GitHub App

1. Create a GitHub App owned by / installed on **Warix-AI** (or `GITHUB_APP_ORG`).
2. Permissions: **Contents** read/write, **Metadata** read, **Administration** read/write (create repos) — tighten once stable.
3. Install on the org; copy installation id.
4. Set:
   - `GITHUB_APP_ID`
   - `GITHUB_APP_PRIVATE_KEY` (PEM with `\n` escapes, or base64 PEM)
   - `GITHUB_APP_INSTALLATION_ID`
   - `GITHUB_APP_ORG=Warix-AI`
   - Optional: `GITHUB_APP_TEMPLATE_REPO=owner/template`

Without these, project create still succeeds; `infra_status` stays `partial` and repo binding is skipped.

### Vercel (team)

- `VERCEL_TOKEN` — team-scoped token for Sandbox + later Deployments API
- `VERCEL_TEAM_ID` — Warix team
- Do **not** rely on developer laptop CLI login for product behavior

### Supabase Management (later)

- `SUPABASE_MANAGEMENT_ACCESS_TOKEN`
- `SUPABASE_MANAGEMENT_ORG_ID`

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/projects/:id/infra/ensure` | Idempotent subdomain + GitHub repo ensure |
| `GET` | `/api/projects/:id/infra?workspaceId=` | Infra status (no secrets) |
| `POST` | `/api/projects/:id/sandbox/ensure` | Start/resume build sandbox (git clone draft) |
| `GET` | `/api/projects/:id/sandbox?workspaceId=` | Sandbox status for Preview chrome |

Auth: Bearer Supabase JWT. Authorization: `assertProjectAccess` before any GitHub/Vercel call.

## Client hooks

- After `createProject` for Build app/site → fire-and-forget `ensureProjectInfraClient`
- On Build panel open → infra ensure + `ensureProjectSandboxClient`
- Preview overlay: Starting / Ready / Error + Retry (force restart)

## Sandbox lifecycle (Phase 2)

- One **build_app** sandbox per user per project (`computer_sessions`)
- Created via `Sandbox.create` with `source: { type: "git", … }` using a short-lived installation token
- Checks out `cander/draft`; exposes port `3000` (preview proxy in Phase 5)
- Resume when possible; recreate from GitHub when dead
- Raw upstream stays in `build_state` (not returned to the browser)

## Database

Migration `061_project_build_infra.sql` adds binding columns on `projects` (`github_*`, `draft_sha`, `cander_subdomain`, `infra_status`, `sandbox_*`, …).

## Security

- Management credentials only on the Next server
- Client never sends repo/sandbox IDs as authority — server loads bindings from DB after ACL
- GitHub installation tokens are mint-and-discard for clone only
- Preview upstream URLs stay out of public API responses in Phase 2
