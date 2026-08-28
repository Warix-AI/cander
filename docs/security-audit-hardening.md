# Security audit & hardening (2026-08)

## Fixed in-repo (Critical / High / safe Medium)

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
| Medium | Stripe-off client plan unlock | Checkout POST admin unlock on bypass |

## Manual Supabase dashboard checklist

Apply migration `023_security_hardening.sql` (`supabase db push` or SQL editor).

- [ ] Confirm Auth → email confirmation required for production
- [ ] JWT expiry reasonable (e.g. ≤ 1 hour) for sensitive tenants
- [ ] Rotate any leaked `service_role` / Stripe / Resend keys
- [ ] Run Security Advisor / Performance Advisor; triage findings
- [ ] Verify no Storage buckets yet (or add path-scoped policies when added)
- [ ] Confirm `anon` key is publishable-only; never ship `service_role` to clients
- [ ] After deploy: attempt JWT client update of `profiles.plan` → expect deny
- [ ] After deploy: non-admin upsert `org_members` → expect deny

## Residual (not fixed this pass)

- Co-member SELECT of full profile (email / Stripe IDs) — needs column grants or a public view
- Membership-only destructive CRUD on threads/projects (insider risk)
- Edge `briefing-sync` global template PKs
- `chat-send` stub without JWT (keep offline until real)
- Email verification not enforced in every API route (rely on Auth settings)
