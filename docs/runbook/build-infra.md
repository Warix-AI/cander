# Build infrastructure (Warix-managed)

Cander Apps and Websites provision durable code and runtime resources **under the Warix organization**. End users never connect their own GitHub, Vercel, or Supabase accounts for Build.

## Layers

| Layer | Role | Integration |
|-------|------|-------------|
| GitHub (Warix org) | Durable source of truth | GitHub App + Octokit |
| Vercel Sandbox | Disposable build/runtime | `@vercel/sandbox` |
| Supabase (Warix org) | Per-app persistent backend | Management API |
| Vercel Deployments | Published hosting | Deployments/Domains API (Phase 7+) |
| `*.cander.app` | Friendly URLs | Edge proxy (draft Phase 5; prod Phase 8) |

## Required server env

See `.env.example`.

### Phase 4 — Supabase Management

```
SUPABASE_MANAGEMENT_ACCESS_TOKEN=
SUPABASE_MANAGEMENT_ORG_ID=          # or slug
SUPABASE_MANAGEMENT_ORG_SLUG=        # preferred for create
SUPABASE_MANAGEMENT_REGION_GROUP=americas
SUPABASE_MANAGEMENT_INSTANCE_SIZE=micro
```

Token needs permission to create projects and read API keys in the Warix org.

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/projects/:id/supabase` | Lazy provision + optional sandbox inject |
| `GET` | `/api/projects/:id/supabase?workspaceId=` | Status (ref/url only — **no secrets**) |
| `POST` | `/api/projects/:id/infra/ensure` | GitHub + subdomain |
| `POST` | `/api/projects/:id/sandbox/ensure` | Sandbox lifecycle (+ start dev server) |
| `GET/…` | `/api/projects/:id/preview/:workspaceId/…` | Same-origin live preview proxy |
| `GET/…` | `/api/preview-host/:subdomain/…` | Host proxy for `draft--*.cander.app` |
| `POST` | `/api/projects/:id/sandbox/files` | File/exec/persist |
| `POST` | `/api/projects/:id/git/persist` | Commit draft |
| `GET` | `/api/projects/:id/git/commits?workspaceId=` | List draft commits (revisions) |
| `POST` | `/api/projects/:id/git/restore` | Move draft tip to SHA + restart sandbox |
| `POST` | `/api/computer/build` | Durable work-task pipeline |

## Phase 4 behavior

1. Lazy: provision when `build.auth.configure`, auth-backed recipes, or build tasks mention auth/supabase
2. Create project under Warix org via Management API
3. Store `supabase_project_ref` + `supabase_status` on `projects`
4. Inject `.env.local` into sandbox (URL + anon + service role) — **gitignored**
5. Commit only `.env.example` + `.gitignore` to `cander/draft`
6. Re-inject on sandbox resume/create when binding is already `ready`

**Never** return service-role or anon keys from public APIs.

## Phase 5 behavior

1. On sandbox ensure/resume, start `npm run dev` (or `next dev`) on port 3000 inside the sandbox
2. Store preview upstream in `computer_sessions.build_state` (never send raw upstream to the browser)
3. Build iframe loads same-origin `/api/projects/:id/preview/:workspaceId/` (cookie auth + `assertProjectAccess`)
4. HTML rewrite keeps `/_next` assets on the path proxy
5. Optional address-bar host: `https://draft--{sub}.cander.app` → `proxy.ts` rewrite → `/api/preview-host/{sub}/…`
6. WebSocket/HMR through route handlers is not supported (426) — use Reload after edits

Upstream origins must match Vercel sandbox hosts (SSRF allowlist).

## Phase 6 behavior

1. Source of truth for draft revisions is git SHAs on `cander/draft`
2. Persist updates `projects.draft_sha` and `project_revisions.draft_tip.storage_pointer = git:{sha}`
3. Candidate change sets after real commits use `git:{sha}` (not stub URIs)
4. `GET …/git/commits` lists draft history and reconciles tip if DB drifted
5. `POST …/git/restore` force-moves the draft tip to an older SHA on that history, then recreates the sandbox
6. Build **Changes** timeline loads commits; Restore calls the restore API

Publish / `published_sha` remains Phase 7.

## Enable Phase 3+ flag

```
CANDER_BUILD_SANDBOX=1
NEXT_PUBLIC_CANDER_BUILD_SANDBOX=1
```
