# Build infrastructure (Warix-managed)

Cander Apps and Websites provision durable code and runtime resources **under the Warix organization**. End users never connect their own GitHub, Vercel, or Supabase accounts for Build.

## Layers

| Layer | Role | Integration |
|-------|------|-------------|
| GitHub (Warix org) | Durable source of truth | GitHub App + Octokit |
| Vercel Sandbox | Disposable build/runtime | `@vercel/sandbox` |
| Supabase (Warix org) | Per-app persistent backend | Management API (Phase 4) |
| Vercel Deployments | Published hosting | Deployments/Domains API (Phase 7+) |
| `*.cander.app` | Friendly URLs | Edge proxy (Phase 5/8) |

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
| `POST` | `/api/projects/:id/sandbox/ensure` | Sandbox lifecycle |
| `POST` | `/api/projects/:id/sandbox/files` | File/exec/persist |
| `POST` | `/api/projects/:id/git/persist` | Commit draft |
| `POST` | `/api/computer/build` | Durable work-task pipeline |

## Phase 4 behavior

1. Lazy: provision when `build.auth.configure`, auth-backed recipes, or build tasks mention auth/supabase
2. Create project under Warix org via Management API
3. Store `supabase_project_ref` + `supabase_status` on `projects`
4. Inject `.env.local` into sandbox (URL + anon + service role) — **gitignored**
5. Commit only `.env.example` + `.gitignore` to `cander/draft`
6. Re-inject on sandbox resume/create when binding is already `ready`

**Never** return service-role or anon keys from public APIs.

## Enable Phase 3 flag

```
CANDER_BUILD_SANDBOX=1
NEXT_PUBLIC_CANDER_BUILD_SANDBOX=1
```
