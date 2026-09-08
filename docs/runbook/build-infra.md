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

### Enable Phase 3 (AI → sandbox → draft push)

```
CANDER_BUILD_SANDBOX=1
NEXT_PUBLIC_CANDER_BUILD_SANDBOX=1
```

This routes `create_work_task` through `/api/computer/build` and unlocks `computer.files.*` / `computer.exec` tools.

### Supabase Management (later)

- `SUPABASE_MANAGEMENT_ACCESS_TOKEN`
- `SUPABASE_MANAGEMENT_ORG_ID`

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/projects/:id/infra/ensure` | Subdomain + GitHub repo |
| `GET` | `/api/projects/:id/infra?workspaceId=` | Infra status |
| `POST` | `/api/projects/:id/sandbox/ensure` | Start/resume sandbox |
| `GET` | `/api/projects/:id/sandbox?workspaceId=` | Sandbox status |
| `POST` | `/api/projects/:id/sandbox/files` | read/write/list/exec/persist |
| `POST` | `/api/projects/:id/git/persist` | Commit dirty sandbox (or explicit files) to `cander/draft` |
| `POST` | `/api/computer/build` | Durable work-task: ensure → write facts.files → build → persist |

Auth: Bearer Supabase JWT + `assertProjectAccess`.

## Phase 3 behavior

1. AI `create_work_task` (when sandbox flag on) → `/api/computer/build`
2. Soft lock: refuse if another `ai_tasks` row for the project is queued/running/verifying
3. Ensure sandbox (git clone draft)
4. Apply `facts.files` writes when present
5. Optional `npm install` / `npm run build`
6. Persist dirty files via Octokit Git Data API → update `projects.draft_sha`
7. Candidate change set for review

`computer.files.write` defaults to persist=true so interactive edits also land on GitHub.

**Git is not on the AI exec allowlist** — push is always server-orchestrated via Octokit.

## Security

- Management credentials only on the Next server
- Path traversal blocked (`safeRepoRelativePath`)
- Client never sends repo/sandbox IDs as authority
- Installation tokens mint-and-discard for clone only
