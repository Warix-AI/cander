# Connector security audit report

**Audit date:** 2026-09-02  
**Commit:** `2be3a73` (post-audit hardening on `main`)  
**Environment:** Staging-first (per plan)

## Executive summary

The Composio Gmail pilot implements **owner-scoped personal connections** with defense-in-depth: JWT auth, workspace membership checks, RLS, server-only OAuth activation, tool allowlists, and response redaction. This audit verified automated tests, documented the HTTP authorization matrix, and implemented P0 hardening (rate-limit fail-closed, workspace-scoped OAuth recovery, explicit `workspaceId` on AI tool paths, read-route rate limits).

**Isolation model:** User A and User B in the same workspace each connect their own Gmail. Neither can read the other's mail via API or AI tools.

---

## Phase 0 — Baseline

| Check | Result | Notes |
|-------|--------|-------|
| Migrations 039, 040, 041 present | Pass | [`039_connector_hardening.sql`](../supabase/migrations/039_connector_hardening.sql), [`040_connector_composio_prep.sql`](../supabase/migrations/040_connector_composio_prep.sql), [`041_connector_oauth_resilience.sql`](../supabase/migrations/041_connector_oauth_resilience.sql) |
| `npm run test:connectors` | Pass | 49 tests |
| `npm run test:security` | Pass | 12 tests |
| `npm run build` | Pass | TypeScript clean |
| Staging Vercel Composio env | **Manual** | Operator must confirm: `COMPOSIO_API_KEY`, `COMPOSIO_GMAIL_AUTH_CONFIG_ID`, `COMPOSIO_WEBHOOK_SECRET`, `COMPOSIO_CALLBACK_VERIFIER_URL` |
| Staging migrations applied | **Manual** | Run SQL probes in [baseline-report.md](./baseline-report.md) |

---

## Phase 1 — Automated unit tests

| Suite | Coverage |
|-------|----------|
| `connector-security.test.ts` | Owner isolation, duplicate initiate, cross-user 404, audit allowlist, client/server import boundary |
| `composio-security.test.ts` | Webhook HMAC, OAuth redirect allowlist, state expiry |
| `composio-oauth-resilience.test.ts` | OAuth claim lease, binding validation, recovery |
| `composio-tools.test.ts` | Payload redaction, Gmail tool mapping |
| `connector-response.test.ts` | User-facing reply voice, empty-result copy |
| `connector-api-security.test.ts` | API auth contract helpers, rate-limit categories |

---

## Phase 2 — Live isolation probe (staging)

Run on staging Supabase with three accounts:

```bash
OWNER_EMAIL=... OWNER_PASSWORD=... \
MEMBER_EMAIL=... MEMBER_PASSWORD=... \
OUTSIDER_EMAIL=... OUTSIDER_PASSWORD=... \
WORKSPACE_ID=ws-... \
npm run test:isolation
```

| Probe | Expected |
|-------|----------|
| Owner lists own `connector_connections` | Pass |
| Outsider sees zero connector rows | Pass |
| Member cannot see owner's connection rows | Pass (extended probe) |
| Legacy `connector_accounts` SELECT revoked | Pass |
| Owner private `ai_chats` hidden from member | Pass |

**Status:** Requires staging credentials — operator sign-off.

---

## Phase 3 — HTTP API authorization matrix

| Route | Auth | Workspace check | Owner scope | Rate limit |
|-------|------|-----------------|-------------|------------|
| `GET /api/connectors/catalog` | Bearer JWT | N/A (global catalog) | N/A | `connector_read` 60/min |
| `GET /api/connectors/connections` | Bearer JWT | `resolveConnectorRequest` | Lists `owner_id = JWT user` | `connector_read` 60/min |
| `GET /api/connectors/connections/[id]` | Bearer JWT | Required `workspaceId` query + membership | `owner_id = JWT user` + workspace match | `connector_read` 60/min |
| `POST /api/connectors/connections/initiate` | Bearer JWT | Membership | Creates for `owner_id = JWT user` | `connector_initiate` 10/min |
| `POST /api/connectors/connections/[id]/disconnect` | Bearer JWT | Membership | Owner only | `connector_disconnect` 10/min |
| `POST /api/connectors/tools/execute` | Bearer JWT | Membership | Active connection `owner_id = JWT user` | `connector_tool_execute` 30/min |
| `GET /api/connectors/oauth/verify` | Cookie or Bearer | Membership from OAuth state | Binds to initiating owner | `connector_callback` 20/min |
| `POST /api/connectors/webhooks/composio` | HMAC signature | N/A | Reconcile by `provider_connection_id` | `connector_webhook` 120/min |

### Test cases (staging)

| Case | Route | Expected |
|------|-------|----------|
| Outsider `workspaceId` | `tools/execute` | 403 Access denied |
| Spoofed workspace (not a member) | `connections/initiate` | 403 |
| Cross-user connection ID | `connections/[id]` | 404 uniform |
| Cross-user disconnect | `disconnect` | 404 |
| Invalid webhook signature | `webhooks/composio` | 401/403 |
| Duplicate `webhook-id` | `webhooks/composio` | 200 idempotent no-op |

---

## Phase 4 — AI path audit

```
AppProvider → fetchPrivateAiReply(workspaceId)
  → runAssistantTurn → setTurnContext(workspaceId)
  → isCommsConnectorIntent → runCommsConnectorTurn
  → executeConnectorGmailTool(call, request.workspaceId)
  → POST /api/connectors/tools/execute (JWT + workspace membership)
```

| Control | Status |
|---------|--------|
| `workspaceId` passed explicitly in comms-turn | Implemented |
| `tools.ts` gmail branch passes `getTurnWorkspaceId()` | Implemented (P0) |
| `ensureGmailConnected` surfaces auth errors | Implemented (P0) |
| Empty results → plain language (`connector-response.ts`) | Implemented |
| Tool JSON / secrets never in user-visible text | `sanitizeAssistantVisibleText` + redaction |

**Cross-user chat isolation:** Enforced server-side at tool execute — connection query filters `owner_id = JWT user.id`. Two users in same workspace get各自的 Gmail only.

---

## Phase 5 — OAuth & webhook (staging manual)

Complete [gmail-pilot-checklist.md](./gmail-pilot-checklist.md) on staging:

- [ ] Full Gmail OAuth → `active`
- [ ] Callback replay rejected
- [ ] Wrong-user callback rejected
- [ ] Signed webhook accepted; replay idempotent
- [ ] Disconnect confirms provider revoke
- [ ] Native OAuth return (Electron/Capacitor) — **blocker if unproven**

Unit coverage for webhook signatures: `composio-security.test.ts`.  
Unit coverage for OAuth binding: `composio-oauth-resilience.test.ts`.

---

## Phase 6 — Hardening implemented

| Gap | Fix |
|-----|-----|
| G2 Rate limit fail-open | `durable-rate-limit.ts` falls back to in-memory limiter on DB error |
| G3 Unrate-limited reads | `connector_read` category on catalog, connections, connection-by-id |
| G4 `[id]` route workspace check | Requires `workspaceId` + `resolveConnectorRequest` |
| G5 Turn context workspaceId | `tools.ts` passes `getTurnWorkspaceId()` to Gmail executor |
| G6 `ensureGmailConnected` swallows errors | Surfaces auth/denied messages |
| G7 OAuth recovery cross-workspace | `findActiveConnectionForOwnerOAuth` scoped to OAuth `workspace_id` |
| G8 HTTP route tests | `connector-api-security.test.ts` |

---

## Phase 7 — Multi-connector readiness

See [new-connector-checklist.md](./new-connector-checklist.md).

---

## Sign-off

| Role | Staging | Production |
|------|---------|------------|
| Automated CI | Pass (local) | Pending deploy |
| Isolation probe | Operator run required | Before enable |
| OAuth E2E | Operator run required | Before enable |
| Gmail catalog enable | **Blocked** until checklist complete | **Blocked** |

**Do not run** `update connector_catalog set enabled = true` for Gmail until staging OAuth/webhook probes pass.
