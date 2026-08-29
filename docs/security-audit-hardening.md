# Security audit & hardening

## 2026-08 pre-complexity pass (isolation before Sandbox)

Goal: verify owner-private chats + invite-only workspaces end-to-end, close P0/P1 holes (especially intelligence null-workspace RLS), then decide go/no-go for Sandbox/PCC complexity.

### Phase A — Inventory

| Item | Status |
|------|--------|
| Migrations `022`–`029` in repo; `029`/`030` applied on live project `xwlmeevrwczclladnlfv` | Pass |
| Edge functions: `ai-chat`, `briefing-sync`, `build-publish`, `chat-send` | Inventories + redeployed this pass |
| Next APIs under `app/api/**` (org/workspace invites, Stripe, billing, onboarding, account) | Inventoried |
| Client key exposure: anon only in browser (`NEXT_PUBLIC_SUPABASE_ANON_KEY`); `SUPABASE_SERVICE_ROLE_KEY` server-only | Pass |
| Unit suites | `test:security` 12, `test:assistant` 32, `test:intelligence` 13 — green |

### Phase B — Two-user live probes (REST / Edge)

Ephemeral Owner A + Member B (same workspace) + Outsider C. Evidence stored as pass/fail below (re-runnable via admin setup; `npm run test:isolation` when credentials set).

| Probe | Result | Evidence |
|-------|--------|----------|
| B SELECT A’s `threads` | Pass | `200` / `rows=0` |
| B SELECT A’s `ai_chats` | Pass | `200` / `rows=0` |
| B Edge `ai-chat` `list_messages` for A’s chat | Pass | `404 Chat not found` |
| C SELECT A’s workspace `projects` | Pass | `200` / `rows=0` |
| B SELECT shared `projects` | Pass | Member sees projects (intentional) |
| Non-admin `workspace_invites` insert | Pass | `403` RLS |
| Wrong-email accept / org foreign `workspace_ids` | Pass (policy) | `023` `accept_org_invite` + `filterOrgWorkspaceIds` |
| `ai_tasks` null `workspace_id` insert | Pass | `403` after migration `030` |
| Outsider `ai_tasks` for foreign workspace | Pass | `403` |
| Member `ai_tasks` with membership | Pass | `201` |
| Co-member SELECT Stripe profile columns | Pass | `403` privilege denied |
| Unauth Edge `chat-send` / `briefing-sync` / `build-publish` | Pass | `401` |
| Outsider `create_chat` with foreign `workspaceId` | Pass | Chat created with `workspace_id: null` |

**Intentional residual:** any workspace **member** can CRUD projects/sources/files (`002_space_entities.sql`). Chats remain **owner-private** (`025`–`027`). Documented product split — not silent.

### Phase C — P0/P1 fixes shipped

| ID | Fix |
|----|-----|
| C1 P0 | Migration `030_intelligence_rls_and_profile_grants.sql`: require non-null `workspace_id` + membership; scrub null orphans; column-restrict profiles (no Stripe IDs for `authenticated`) |
| C1 client | `durable-tasks`, `telemetry`, `revisions`, `execution-adapter` always require / fail closed without `workspaceId` |
| C2 | `briefing-sync`: JWT + membership; per-workspace template IDs |
| C3 | `chat-send`: JWT required (still write-less stub) |
| C4 | Org invite accept uses **user JWT** `rpc(accept_org_invite)` (binds `auth.uid()`) |
| C5 | Profile Stripe columns revoked from authenticated SELECT |
| C6 | Stripe unlock bypass gated: production needs `ALLOW_BILLING_BYPASS=1` when Stripe unset |
| C7 | `SharedPanel` no longer claims workspace-visible chats |

### Phase D — Edge / Next API IDOR matrix

| Surface | No JWT | Foreign workspace/org/member |
|---------|--------|------------------------------|
| Edge `ai-chat` | 401 | Owner filter; create strips non-member workspace |
| Edge `build-publish` | 401 | Membership + project∈workspace |
| Edge `briefing-sync` | 401 | Membership required |
| Edge `chat-send` | 401 | Write-less stub |
| `app/api/workspace/invites/*` | 401 | Workspace Admin/Owner (+ org match when orgId set) |
| `app/api/org/**` | 401 | `assertOrgManager` / billing owner checks; role update scoped to `org_id` |
| `app/api/stripe/checkout` | 401 | Profile ownership via admin read; webhook signature required |
| `app/api/stripe/seats` | 401 | Billing owner only |
| `app/api/billing/portal` | 401 | Own Stripe customer via admin read |
| `app/api/billing/cancel` | 401 | Own profile/org subscription |

### Phase E — Functional smoke (short)

| Path | Status |
|------|--------|
| Sign up / sign in (Auth) | Probe users sign-in `200` |
| Personal / outsider empty workspace data | Pass (project deny) |
| Create project in shared workspace | Pass (member CRUD) |
| Intelligence `ai_tasks` with workspace set | Pass |
| Invite teammate → projects yes, chats no | Pass (matrix above) |
| Publish path (`build-publish` JWT + membership) | Code + Edge deploy; UI publish still needs manual click on staging |

### Phase F — Go / no-go for Sandbox complexity

**Conditional go:** control-plane isolation for chats + intelligence RLS is trustworthy after `030` + Edge redeploy.

**Still required before shipping Sandbox/PCC compute:**

- Real sandbox network egress / secret isolation design (not in this pass)
- Capability gateway enforcement with deny-by-default for untrusted tool results
- Do not enable `sandbox_enabled` / `pcc_enabled` in production until those land

**Verdict:** Ready to *design* Sandbox seams against a trustworthy control plane. **Not** ready to enable live sandbox execution.

---

## Fixed in-repo (earlier 2026-08 Critical / High)

| Severity | Issue | Fix |
|----------|--------|-----|
| Critical | Client could UPDATE `profiles.plan` / billing columns | `023_security_hardening.sql` column grants + policy |
| Critical | `org_members` self-write privilege escalation | Dropped `org_members_write`; mutations via service-role APIs |
| Critical | `/api/onboarding/finish` promoted Owner on all memberships | Only personal `ws-{user}` workspace |
| Critical | Org invite `workspaceIds` cross-tenant | `filterOrgWorkspaceIds` + accept RPC org ownership check |
| Critical | Workspace invite org-manager IDOR | Require workspace Admin/Owner + org match |
| Critical | `accept_org_invite` unbound to `auth.uid()`; anon EXECUTE | Bind caller; revoke anon |
| Critical | `sync_org_admins_to_workspace` injected into foreign workspaces | Only when `workspaces.org_id` matches |
| High | Auth callback open redirect + code leak | `safeAuthNextPath`; error redirect without secrets |
| High | Unauthenticated Stripe checkout GET | Require Bearer + profile ownership |
| High | Any member could rewrite `workspace_policies` | Admin-only writes |
| High | Unsandboxed project iframes | `sandbox` + http(s) for published URLs |
| Medium | Invite email HTML injection | `escapeHtml` |
| Medium | Stripe-off client plan unlock | Checkout/onboarding bypass gated (see C6) |

## Manual Supabase dashboard checklist

- [x] Apply `030_intelligence_rls_and_profile_grants.sql` (live)
- [x] Redeploy Edge `ai-chat`, `briefing-sync`, `build-publish`, `chat-send`
- [ ] Confirm Auth → email confirmation required for production
- [ ] JWT expiry reasonable (e.g. ≤ 1 hour) for sensitive tenants
- [ ] Rotate any leaked `service_role` / Stripe / Resend keys
- [ ] Run Security Advisor / Performance Advisor; triage findings
- [ ] Verify no Storage buckets yet (or add path-scoped policies when added)

## Residual (accepted this pass)

- Membership-shared projects/files/sources (by design) vs owner-private chats
- Legacy `chat-api.supabase` still invokes write-less `chat-send` for non–AI-path stubs (JWT gated)
- Email verification not re-checked in every API route (rely on Auth settings)
- Parallel multi-agent / MCP connector security — out of scope until Sandbox work
