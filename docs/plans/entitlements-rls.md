# Entitlements → RLS mapping

How client-side `entitlementsFor()` in `lib/entitlements.ts` maps to Supabase Row Level Security and future Edge Function checks.

## Plan gates

| Client check | Plan | Server enforcement |
|--------------|------|-------------------|
| `hasWorkSpace(plan)` | Max, Ultra | `workspace_members.spaces[]` must include `work` for entity/chat reads in Work space |
| `hasWorkspaceKnowledge(plan)` | Pro+ | RLS on `knowledge_bases` / `knowledge_files` — workspace member required; plan check in Edge Function for uploads (Phase 4+) |
| `hasConnectorPolicies(plan)` | Max, Ultra + org active | `workspace_policies.disabled_connectors` writable only by Owner/Admin |
| `workspaceCap(plan)` | varies | Enforce on `workspaces` insert via Edge Function or trigger (not yet in SQL) |
| `hostingAllowed(mode)` | plan-specific | Enforce in `build-publish` Edge Function (Phase 5) |

## Role gates

| Client check | Role | RLS policy |
|--------------|------|------------|
| `canManageBilling` | Owner | Billing tables TBD — Owner-only writes |
| `canManageMembers` | Owner, Admin | `org_members_write`, `workspace_member_spaces` — Admin+ on shared workspace |
| `canManageWorkspaces` | Owner, Admin | `workspaces_insert_authenticated`, `workspaces_update_admin` |
| Owner demotion guard | Owner | Client-only today; add trigger preventing last Owner removal |

## Space ACL (`memberSpaces()`)

| Client | Server |
|--------|--------|
| `memberSpaces(workspaceId, memberId)` reads `workspace_member_spaces` | Mirror in Phase 1+ entity RLS optional filter on `space` column |
| `toggleMemberSpace()` | Upserts `workspace_member_spaces` row; debounced via `org-policy-sync.ts` |

Primary ACL source of truth in Supabase mode:

1. `workspace_members.spaces[]` — profile's own access (from signup / invite)
2. `workspace_member_spaces` — per org-member demo roster ACL (Phase 3)
3. `org_members.workspace_ids` — which workspaces a roster member belongs to

## Org vs personal

| `Member.kind` | `seatStatus` | Effect |
|---------------|--------------|--------|
| `org` + `active` + Max/Ultra | orgActive | Shared workspaces, admin settings |
| `org` + `pending` | pendingInvite | Invite wall; no shared workspace writes |
| `personal` | solo workspaces | Scoped to `solo-*` workspace IDs |

## Pins & sidebar

User-scoped only — no plan gate:

- `user_pins.profile_id = auth.uid()`
- `sidebar_layouts.profile_id = auth.uid()`

## What stays client-only (v1)

- Appearance / theme (`courier-theme`)
- Demo actor preset picker (local dev)
- Entitlement UI hiding (server must still enforce on write)

## Recommended next steps (Phase 4+)

1. Edge Function middleware: reject writes when `profiles.plan` lacks capability.
2. Consolidate `workspace_member_spaces` into `workspace_members` for real invites (email → profile_id).
3. Add `organizations` billing table with Owner-only RLS.
