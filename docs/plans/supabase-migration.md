# Supabase migration plan

One-pass plan to take Cander from **100% local mock** to **Supabase-backed production data**. Work top-to-bottom in order; later phases assume earlier ones are done.

**Repo:** `Warix-AI/cander`  
**Current state:** `ApiBundle` boundary exists; all adapters are local. Threads/auth/org still live outside the API layer.

---

## Goals

1. Real auth and workspace scoping (no `courier-signed-in` flag).
2. Swap `createLocalApiBundle()` for env-driven `createApiBundle("local" | "supabase")`.
3. Persist space entities, chat, org policy, and connectors in Postgres with RLS.
4. Keep **local mode** working for offline dev and demos.
5. Minimize UI churn — hooks (`use-space-query`, `use-space-index`) stay stable.

---

## Architecture target

```
AppProvider (UI + navigation only; no thread ownership long-term)
  └─ SpaceDataProvider
       ├─ createApiBundle(mode)
       │    ├─ entities → SpaceEntityApi (Supabase)
       │    ├─ chat     → ChatApi (Supabase)
       │    ├─ connectors → ConnectorApi (Supabase + Edge Functions)
       │    ├─ build    → BuildRuntimeApi (stub → external service later)
       │    └─ browser  → BrowserApi (optional persist later)
       ├─ WorkspaceCtx { workspaceId, profileId }
       └─ Supabase session (auth.users.id)

lib/session.ts     → thin wrapper over Supabase Auth session
lib/data.ts        → dev seed only (NEXT_PUBLIC_DATA_BACKEND=local)
localStorage keys  → import-on-first-login, then deprecate
```

---

## Phase 0 — Foundation (do first)

**Outcome:** Supabase project wired; auth works; no product data migrated yet.

### 0.1 Supabase project & env

- [ ] Create Supabase project (staging + prod).
- [x] Add `.env.example`:

  ```bash
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=          # server/Edge Functions only
  NEXT_PUBLIC_DATA_BACKEND=local      # local | supabase
  ```

- [x] Add `@supabase/supabase-js` and `@supabase/ssr` to `package.json`.
- [x] Add `lib/supabase/client.ts` (browser) and `lib/supabase/server.ts` (RSC/route handlers).
- [x] Add `lib/supabase/middleware.ts` for session refresh (Next.js middleware).

### 0.2 Initial schema (auth + tenancy only)

Run migration `001_tenancy.sql` (file in `supabase/migrations/` — apply in Supabase dashboard or via CLI):

- [x] Migration SQL authored (`supabase/migrations/001_tenancy.sql`)
- [ ] Migration applied to staging Supabase project

| Table | Purpose |
|-------|---------|
| `organizations` | Org container |
| `profiles` | `id → auth.users`, name, email, plan, role |
| `workspaces` | Workspace catalog (replaces `workspace-catalog` localStorage) |
| `workspace_members` | `profile_id`, `workspace_id`, role, `spaces[]` ACL |

**RLS:** Every table scoped by membership. Profile row created on signup via trigger.

### 0.3 Replace fake auth

| Remove / change | File |
|-----------------|------|
| `persistSignedIn` / `courier-signed-in` flag | `lib/session.ts` |
| Onboarding sign-in flow | `components/onboarding/OnboardingFlow.tsx` |
| Demo actor picker → profile switcher (dev only) | `lib/session.ts`, settings |

- [x] Supabase Auth: email/password (+ magic link helper for v1).
- [x] `getAuthSnapshot()` reads Supabase session, not localStorage boolean.
- [x] `actorId` becomes `profile.id` from session.
- [x] `SpaceDataBridge` passes real `profileId` into `SpaceDataProvider`.

### 0.4 Adapter factory

- [x] Add `createApiBundle(mode: "local" | "supabase")` in `lib/api/index.ts`.
- [x] `SpaceDataProvider` reads `NEXT_PUBLIC_DATA_BACKEND`.
- [x] Supabase mode uses Supabase adapters for entities, chat, connectors, build, and browser.

**Exit criteria:** User can sign up/in; workspace list loads from Supabase; local mode still works via env flag.

---

## Phase 1 — Space entities (highest ROI)

**Outcome:** Projects, sources, briefing, deployments, attachments in Postgres.

### 1.1 Schema

Migration `002_space_entities.sql`:

- [x] Migration SQL authored (`supabase/migrations/002_space_entities.sql`)
- [ ] Migration applied to staging Supabase project

| Table | Maps to |
|-------|---------|
| `projects` | `SpaceProject` |
| `sources` | `SpaceSource` |
| `deployments` | `Deployment` |
| `briefing_items` | `BriefingItem` |
| `work_attachments` | `SpaceAttachment` |
| `entity_links` | `linkReference()` (currently no-op) |

Common columns: `id`, `workspace_id`, `created_at`, `updated_at`, `version`.

**RLS:** `workspace_id IN (SELECT … FROM workspace_members WHERE profile_id = auth.uid())`.  
Optional: space column checked against `workspace_members.spaces[]` (mirror `memberSpaces()` in `lib/workspace-policy.ts`).

### 1.2 Supabase adapter

- [x] Implement `lib/api/space-entity-api.supabase.ts` — full `SpaceEntityApi`.
- [x] Wire into `createApiBundle("supabase")`.
- [x] Use optimistic concurrency on `version` column for updates.

### 1.3 Fix local bugs before parity

| Bug | File | Fix |
|-----|------|-----|
| Sources seeded with wrong `workspaceId` | `lib/api/space-entity-store.ts` `seedSources()` | [x] Use actual workspace IDs |
| Attachments derived from `work-apps` | `listAttachments()` | [x] Persist in `work_attachments` (local store) |
| `linkReference` no-op | `space-entity-store.ts` | [x] Implement locally + in Supabase |

### 1.4 Unify project sources (blocker for clean migration)

- [x] `AppProvider` `project` resolution reads entity store via `project-resolver`.
- [x] `lib/intent.ts` uses workspace-scoped projects from entity store.
- [ ] Remaining UI: `ProjectsBrowser`, studio/personal dashboards still import `lib/data` (non-blocking).

### 1.5 Data import

- [x] On first Supabase session: `courier-space-entities-v1` → upsert via `entity-sync.ts`.
- [x] Mark import complete with local flag `courier-entities-imported-v1`.

### 1.6 Realtime (optional in Phase 1)

- [x] Supabase Realtime on `projects`, `sources`, etc. → hydrate store + bump `entityRevision`.

**Exit criteria:** Work/Build/Explore dashboards load from Supabase; create/update/delete persists; local mode unchanged.

---

## Phase 2 — Chat & threads

**Outcome:** Threads and messages in Postgres; Recents index complete.

### 2.1 Schema

Migration `003_chat.sql`:

- [x] Migration SQL authored (`supabase/migrations/003_chat.sql`)
- [ ] Migration applied to staging Supabase project

| Table | Maps to |
|-------|---------|
| `threads` | `Thread` (minus embedded messages) |
| `messages` | `Message` |

Columns: `workspace_id`, `space_id`, `project_id`, `persistent`, `session_summary`, `blocks` as JSONB on messages.

**RLS:** Same workspace membership as parent thread.

### 2.2 Migrate thread ownership out of AppProvider

Two options (pick **B** for cleaner long-term):

**A — Bridge ( faster )**  
- [ ] `registerChatApiBridge()` from `AppProvider` in `useEffect` (bridge already defined in `lib/api/chat-api.ts`).
- [ ] Implement `lib/api/chat-api.supabase.ts` for remote reads/writes.
- [ ] AppProvider still holds React state but syncs through bridge.

**B — Store ( cleaner )**  
- [x] New `chat-store` in `lib/api/chat-store.ts` (localStorage + subscribe).
- [x] `AppProvider` reads/writes chat store instead of `useState(starterThreads)`.
- [ ] `AppProvider.sendMessage` → direct `api.chat.sendMessage` (build-loop stays client-side for now).

### 2.3 sendMessage → Edge Function

- [x] `supabase/functions/chat-send` — mock LLM reply (swap for real model later).
- [x] Keep `lib/build-loop.ts` as **local mode fallback** (`DATA_BACKEND=local`).
- [x] `chat-api.supabase.ts` `sendMessage` calls Edge Function in supabase mode.

### 2.4 Recents & search

- [x] `useSpaceIndex` loads threads from `api.chat.listThreads`.
- [x] Realtime subscription on `threads` / `messages` bumps chat store (multi-tab sync).
- [ ] Optional: Postgres full-text on `threads.title`, `messages.content`.

**Exit criteria:** New chat persists across refresh; Recents shows DB threads; multi-tab sync via Realtime.

---

## Phase 3 — Org, policy, settings

**Outcome:** Settings screens write to Supabase; entitlements enforced server-side.

### 3.1 Schema

Migration `004_org_policy.sql`:

- [x] Migration SQL authored (`supabase/migrations/004_org_policy.sql`)
- [ ] Migration applied to staging Supabase project

| Table | Replaces |
|-------|----------|
| `workspace_policies` | `lib/workspace-policy.ts` localStorage |
| `org_members` | `lib/data.ts` members + `courier-org-members` |
| `knowledge_bases` | policy seed KBs |
| `knowledge_files` | KB file metadata (+ Supabase Storage for blobs) |
| `user_pins` | `courier-pins` in session |
| `sidebar_layouts` | `courier-sidebar` in session |

### 3.2 Entitlements & RLS

- [x] Document mapping: `entitlementsFor()` → RLS policies (`docs/plans/entitlements-rls.md`).
- [ ] Plan gates (Free/Pro/Ultra/Max) enforced on write paths, not UI alone.
- [x] `memberSpaces()` ACL → `workspace_member_spaces` table + sync.

### 3.3 Settings UI

- [x] Bulk sync: `lib/api/org-policy-sync.ts` — import, hydrate, debounced push, realtime.
- [x] `workspace-policy.ts` + `session.ts` replace/hydrate helpers.
- [x] `SpaceDataProvider` bootstraps org policy in supabase mode.
- [ ] Appearance stays local; full invite-by-email flow (Phase 4).

**Exit criteria:** Invite member, change role, toggle space access — all persisted in Supabase.

---

## Phase 4 — Connectors

**Outcome:** One connector model; OAuth-ready.

### 4.1 Consolidate three local stores

| Today | Target |
|-------|--------|
| `lib/api/connector-api.ts` | Single `ConnectorApi` |
| `lib/work-connectors.ts` | ↓ synced via `connector-sync.ts` |
| `lib/workspace-connections.ts` | ↓ |
| `lib/connector-install.ts` | ↓ |

Schema migration `005_connectors.sql`:

- [x] Migration SQL authored (`supabase/migrations/005_connectors.sql`)
- [ ] Migration applied to staging Supabase project

| Table | Purpose |
|-------|---------|
| `connector_catalog` | Static marketplace (seed from `lib/data.ts` connectors) |
| `connector_installations` | Profile catalog installs + workspace work stack |
| `connector_accounts` | Connected accounts (`token_ref` for Vault later) |

### 4.2 Briefing sync

- [x] `ConnectorApi.syncBriefing()` → `briefing-sync` Edge Function (mock templates).
- [x] Writes `briefing_items` rows; UI unchanged via `useSpaceBriefingItems`.

### 4.3 MCP / panel sessions

- [x] `openSession()` reads `panel_type` from catalog + local account state.
- [ ] Live OAuth token refresh (Phase 4+ / production infra).

**Exit criteria:** Connect/disconnect persists; briefing items sync from one connector end-to-end.

---

## Phase 5 — Build & browser (can stay stubbed longer)

**Outcome:** Publish flow hits real infra when ready.

### 5.1 Build runtime

| Today | Target |
|-------|--------|
| Fake `*.courier.app` URLs | `BuildRuntimeApi` → `build-publish` Edge Function |
| Hardcoded file tree | `project_files` table + default seed |
| `publish` → local deployment row | Edge Function writes `deployments` + updates project |

- [x] Migration SQL authored (`supabase/migrations/006_build_browser.sql`)
- [ ] Migration applied to staging Supabase project
- [x] Edge Function `build-publish` updates `deployments` and project `published_url`.
- [x] `lib/api/build-runtime-api.supabase.ts` wired in `createApiBundle("supabase")`.
- [x] Keep local stub when `DATA_BACKEND=local`.

### 5.2 Browser

- [x] `browser_sessions` table — per profile + workspace URL/title.
- [x] `lib/api/browser-sync.ts` — import, hydrate, debounced push, realtime.
- [x] `captureReference` uses Supabase entity `createSource` in supabase mode.

**Exit criteria:** Publish updates real deployment URL; preview can remain client-side until infra exists.

---

## Phase 6 — Cleanup

- [x] `lib/dev-data.ts` marks `lib/data.ts` as local-dev seed; staging seed in `supabase/seed.sql`.
- [x] Legacy localStorage cleanup after import (`lib/legacy-storage.ts` + unified bootstrap).
- [x] Remove deprecated auth keys (`courier-signed-in`, `courier-actor`) post-import.
- [x] Unified `lib/import/bootstrap-supabase.ts` replaces per-phase bootstrap calls.
- [x] CI: `.github/workflows/supabase-ci.yml` + `scripts/check-migrations.sh`.
- [x] Runbook: `docs/runbook/supabase.md`.
- [ ] Migrate remaining UI reads from `lib/data.ts` to entity store (non-blocking).

**Exit criteria:** Supabase migration complete; local mode unchanged; runbook documents deploy path.

---

## File checklist (what to add)

| Path | Purpose |
|------|---------|
| `.env.example` | Document all env vars |
| `lib/supabase/client.ts` | Browser client |
| `lib/supabase/server.ts` | Server client |
| `lib/supabase/middleware.ts` | Session refresh |
| `lib/api/index.ts` | `createApiBundle(mode)` |
| `lib/api/space-entity-api.supabase.ts` | Entity CRUD |
| `lib/api/chat-api.supabase.ts` | Thread/message CRUD |
| `lib/api/connector-api.supabase.ts` | Connector CRUD + sync |
| `lib/import/local-to-supabase.ts` | One-time localStorage import |
| `supabase/migrations/*.sql` | Schema + RLS |
| `supabase/functions/chat-send/` | LLM message handler |
| `supabase/functions/sync-briefing/` | Connector sync |
| `scripts/seed.ts` | Dev seed from `lib/data.ts` |

---

## File checklist (what to adjust)

| Path | Change |
|------|--------|
| `components/app/SpaceDataProvider.tsx` | Env-based bundle, Supabase client inject |
| `components/app/AppProvider.tsx` | Remove thread state (Phase 2); use entity API for projects |
| `lib/session.ts` | Supabase Auth instead of localStorage flags |
| `lib/api/space-entity-store.ts` | Fix seed bugs; implement `linkReference`, attachments |
| `lib/intent.ts` | Resolve projects via API, not `lib/data.ts` |
| `lib/hooks/use-space-index.ts` | Threads from `api.chat` only |
| `components/onboarding/OnboardingFlow.tsx` | Real signup/signin |

---

## File checklist (what to remove or gate later)

| Path | When |
|------|------|
| Direct `lib/data.ts` imports in UI | After Phase 1–2 |
| `persistSignedIn` / demo auth | Phase 0 |
| `registerChatApiBridge` empty stub behavior | After Phase 2B |
| Parallel connector localStorage modules | Phase 4 |

---

## RLS policy template

```sql
-- Example: projects
CREATE POLICY "members read projects"
  ON projects FOR SELECT
  USING (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.profile_id = auth.uid()
    )
  );

CREATE POLICY "members write projects"
  ON projects FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm
      WHERE wm.profile_id = auth.uid()
        AND (wm.role IN ('owner', 'admin') OR space = ANY(wm.spaces))
    )
  );
```

Repeat for all workspace-scoped tables. Service role only for: seed scripts, briefing sync, deploy webhooks, connector token refresh.

---

## Migration order (single pass summary)

| Step | Phase | Effort | Unblocks |
|------|-------|--------|----------|
| 1 | 0 — Supabase + auth + env | Medium | Everything |
| 2 | 0 — `createApiBundle` factory | Small | Adapter swap |
| 3 | 1 — Entity schema + adapter | Large | Dashboards, panels |
| 4 | 1 — Unify project sources | Medium | Clean data model |
| 5 | 1 — localStorage import | Small | User data carryover |
| 6 | 2 — Chat schema + adapter | Large | Recents, persistence |
| 7 | 2 — Move threads out of AppProvider | Large | Real chat product |
| 8 | 3 — Org/policy schema | Medium | Settings, teams |
| 9 | 3 — RLS mirrors entitlements | Medium | Security |
| 10 | 4 — Consolidate connectors | Medium | Work briefing, OAuth |
| 11 | 5 — Build/browser real infra | Large | Publish (optional v1) |
| 12 | 6 — Cleanup & deprecate local | Medium | Production hygiene |

**Minimum viable Supabase (ship first):** Steps 1–7.  
**Team-ready product:** Through step 9.  
**Full connector + build story:** Steps 10–12.

---

## Testing strategy

- [ ] **Dual mode:** Every feature works with `DATA_BACKEND=local` and `supabase`.
- [ ] **RLS tests:** Supabase CLI policy tests per table (member vs non-member vs wrong space).
- [ ] **Import test:** Fresh login with populated localStorage → data appears in Supabase once.
- [ ] **Offline:** Local mode unchanged for demos and airplane dev.

---

## Open decisions (pick before Phase 0)

1. **Auth method v1:** Magic link vs Google OAuth vs both?
2. **Thread migration:** Bridge (A) or full store move (B)?
3. **LLM in v1:** Edge Function + which provider?
4. **Storage:** Supabase Storage for KB files and project assets?
5. **Multi-org:** One org per user initially, or full org switcher from day one?

---

## References (current code)

| Concern | Primary files |
|---------|----------------|
| API boundary | `lib/api/index.ts`, `lib/api/space-entity-api.ts` |
| Local entity store | `lib/api/space-entity-store.ts`, `lib/api/space-entity-api.local.ts` |
| Chat (unwired) | `lib/api/chat-api.ts`, `components/app/AppProvider.tsx` |
| Hooks | `lib/hooks/use-space-query.ts`, `lib/hooks/use-space-index.ts` |
| Provider | `components/app/SpaceDataProvider.tsx` |
| Auth (fake) | `lib/session.ts` |
| Seed data | `lib/data.ts` |
| Entitlements | `lib/entitlements.ts`, `lib/workspace-policy.ts` |
| Connectors (split) | `lib/api/connector-api.ts`, `lib/work-connectors.ts`, `lib/workspace-connections.ts` |
| Mock AI | `lib/build-loop.ts` |

---

*Last updated: 2026-08-26 — pre-Supabase frontend freeze.*
