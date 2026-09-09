# Build infrastructure (Warix-managed)

Cander Apps and Websites provision durable code and runtime resources **under the Warix organization**. End users never connect their own GitHub, Vercel, or Supabase accounts for Build.

## Layers

| Layer | Role | Integration |
|-------|------|-------------|
| GitHub (Warix org) | Durable source of truth | GitHub App + Octokit |
| Vercel Sandbox | Disposable build/runtime | `@vercel/sandbox` |
| Supabase (Warix org) | Per-app persistent backend | Management API |
| Vercel Deployments | Published hosting | Deployments API (Phase 7); Domains (Phase 10) |
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
| `GET/…` | `/api/publish-host/:subdomain/…` | Public host proxy for `{sub}.cander.app` |
| `POST` | `/api/projects/:id/sandbox/files` | File/exec/persist |
| `POST` | `/api/projects/:id/git/persist` | Commit draft |
| `GET` | `/api/projects/:id/git/commits?workspaceId=` | List draft commits (revisions) |
| `POST` | `/api/projects/:id/git/restore` | Move draft tip to SHA + restart sandbox |
| `POST` | `/api/projects/:id/publish` | Promote draft → Vercel production |
| `GET/POST/DELETE` | `/api/projects/:id/domains` | Custom domain attach / status / detach |
| `GET/PATCH` | `/api/projects/:id/website-setup` | Guided website create brief (answers + status) |
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

## Phase 7 behavior

1. `POST /api/projects/:id/publish` (Publish sheet → build runtime) deploys the current `draft_sha`
2. Lazy-create a Warix-team Vercel project (`projects.vercel_project_id`) linked to the GitHub repo when possible
3. Create a **production** deployment from the draft tip via Deployments API; poll until `READY`
4. On success only: promote `main` (default branch) to that SHA, set `published_sha` / `published_url` / `vercel_production_deployment_id`, insert a `deployments` row (`kind=production`), and store `project_revisions` published pointer as `git:{sha}`
5. On deploy failure: leave the previous published tip unchanged
6. Preferred `{slug}.cander.app` URL is stored when provided; **Phase 8** routes that host to production

Requires `VERCEL_TOKEN` + `VERCEL_TEAM_ID`, GitHub App, and Vercel↔GitHub integration on the Warix team for git-based deploys.

Migration: `062_deployments_publish_meta.sql` (`vercel_deployment_id`, `git_sha`, `kind` on `deployments`).

## Phase 8 behavior

1. `https://{cander_subdomain}.cander.app` → `proxy.ts` → `/api/publish-host/{sub}/…` (public, no auth)
2. Upstream is the pinned `projects.vercel_production_url` (Vercel deployment origin); falls back to deployment id lookup
3. SSRF allowlist: https `*.vercel.app` only — never proxy to `*.cander.app` (loop) or arbitrary hosts
4. Before every publish, Cander disables Vercel Authentication, password
   protection, and trusted-IP protection on the tenant Vercel project. This is
   also repaired by an idempotent republish, so the public Cander hostname
   never renders a Vercel login page.
4. Host precedence: markdown `m…` → `draft--…` (auth preview) → bare subdomain (production)
5. Publish stores both friendly `published_url` and `vercel_production_url` (migration `063`)
6. Matcher includes `/_next/static` so tenant hosts can proxy app assets; platform static short-circuits

DNS: platform wildcard `*.cander.app` must already point at the Cander deployment (same as draft hosts).

## Phase 9 behavior

1. Preview SSRF allowlist is suffix-only (no `includes("vercel")` escape hatch)
2. Preview/publish proxies strip `Authorization`, `Cookie`, and `X-Forwarded-*` toward upstreams
3. Preferred `published_url` must be the project’s `*.cander.app` host or a **verified** custom domain
4. Publish is billed as `sandbox_deploy`; idempotent when `published_sha` already equals draft tip
5. Concurrent AI builds block publish; stale sandboxes are stopped before recreate
6. `vercelFetch` retries on 429/5xx; with `NEXT_PUBLIC_CANDER_BUILD_SANDBOX=1`, Edge `build-publish` stub is not used as a fake “live” path

## Phase 10 behavior

1. `POST/GET/DELETE /api/projects/:id/domains` attaches customer domains on the Warix Vercel project (Domains API)
2. Stores `custom_domain` + `custom_domain_status` (`pending|verified|error`) + verification jsonb (migration `064`)
3. Domains sheet shows DNS hint + refresh verification; traffic is **Vercel-native** (CNAME → Vercel), not Cander reverse-proxy
4. Only verified custom domains may become `published_url` on publish

## Guided website setup

Websites (`kind=site`) use an **8-step ClarificationCard** before any draft is generated:

1. Business + goal → 2. Audience + CTA → 3. Site depth → 4. Visual style → 5. Colors → 6. Layout shape → 7. Copy tone → 8. Sections/features → confirm **Build my site**
2. Chat shows a **natural-language summary** from the user (raw field dumps stay server-side)
3. Preview stays blank with an 8-segment Cander progress ring (`setup` / spinning `building`) until brief `status=ready`, then auto-ensures sandbox preview
4. Pipeline: brief → `planWebsite` SiteSpec → **server** `/api/ai/twenty-first` (MCP with `API_KEY_21ST`) → vendor files → Codex adapt → validate → preview. Catalog compose is the fallback if MCP is down/empty.
5. Sites **skip** auto Supabase provision/inject; apps keep the heavier backend path

Migration: `065_website_setup_brief.sql` (`projects.website_setup_brief` jsonb).

Server env for 21st (never `NEXT_PUBLIC_`; must be available to the Next.js server runtime):

```
API_KEY_21ST=
# TWENTY_FIRST_API_KEY=   # alias
```

Smoke (server): `API_KEY_21ST=… npx tsx scripts/test-21st-mcp.ts`  
Smoke (deployed): `GET /api/ai/twenty-first` → `{ configured: true }`

## Enable Phase 3+ flag

```
CANDER_BUILD_SANDBOX=1
NEXT_PUBLIC_CANDER_BUILD_SANDBOX=1
```

## Plan-first create pipeline (dogfood)

Opt-in until Phase 7 default-on. When enabled, site create persists `project_spec` / `build_plan` (markdown DB-only) / `research_manifest` / `implementation_manifest`, retrieves 21st via role+designIntent (not business nouns), and gates preview on a runnable draft tip (`package.json` + `next`).

```
CANDER_BUILD_PLAN_FIRST=1
# optional UI gate:
NEXT_PUBLIC_CANDER_BUILD_PLAN_FIRST=1
```

Apply migration `066_plan_first_build_artifacts.sql` before relying on persistence.

Retry budgets live in `lib/ai/build/retry-budgets.ts`. Sandbox ensure is single-flight (`lib/build/sandbox/ensure-coalesce.ts`); publish hard-fails if `vercel_project_id` cannot be persisted.

Legacy `runWebsiteCreatePipeline` remains the default when the flag is off.
