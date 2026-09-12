# Platform Admin (`/admin`)

Internal Cander operating mode for platform operators — not a tenant org role, and not a generic SaaS admin template.

## Shell map

Same column map as the product app:

| Region | Role |
|--------|------|
| Left | Admin nav (Overview, Plans, Pricing, …) — product Sidebar role |
| Center | Admin chat (read tools: list accounts, open plans, show usage) |
| Right | Admin workspace — selected section UI (product ContextPanel role) |

Mobile: menu ↔ chat ↔ workspace pager (same primitives as the product shell).

Platform admins get a **product switcher** (Cander ↔ Admin) in the sidebar header — same pattern on `/admin` and in the main app sidebar / General menu.

**Admin chat** is real Cander AI (`POST /api/admin/chat`) with read tools over Overview, Accounts, Plans, Pricing, Usage, Subscriptions, Enterprise, Audit, and Operations. It opens the matching right panel via `navigateTo`. Writes stay in the workspace UI.

Sections: Overview · Plans · Pricing · Accounts · Usage · Subscriptions · Enterprise · Audit · Operations.

## Auth

Access requires:

1. Signed-in Supabase user, and
2. `profiles.is_platform_admin = true` **or** profile id listed in `CANDER_PLATFORM_ADMIN_IDS` (env bootstrap; `CANDER_USAGE_ADMIN_IDS` still accepted as fallback).

**Org Owner/Admin never grants `/admin` or `/api/admin/*`.** Shared helper: `requirePlatformAdmin` / `isPlatformAdmin` in `lib/admin/auth.ts`.

Layout gates with a server check; APIs require bearer + platform admin.

## Data model notes

- Metering SoT: `ai_plan_minute_configs` + period snapshots on `account_usage_periods`.
- Pricing SoT (display/slider): `pricing_plans` (provider-independent).
- Overrides: `admin_account_overrides` history + mirrored `profiles.ai_minutes_*` for metering.
- Audit: append-only `admin_audit_log` via `writeAdminAudit`.
- Plan/pricing PATCH **never** rewrites open period `included_minutes` snapshots.

Usage periods are **calendar months**. Stripe `subscription_period_end` is labeled separately in Subscriptions.

## Billing provider

`lib/billing-provider/types.ts` defines Polar-ready interfaces. Runtime stub: `NotConnectedBillingProvider`. UI shows “Billing provider not connected” when no Stripe fields; Stripe columns render as provider `stripe` read-only. **No Polar client/credentials in this phase.**

## Tests

```bash
node --experimental-strip-types --test scripts/platform-admin.test.ts
```

Also covered under `npm run test:usage` when that script includes this file (or run directly).

## Bootstrap an admin

```sql
update public.profiles set is_platform_admin = true where email = 'you@example.com';
```

Or set `CANDER_PLATFORM_ADMIN_IDS=<uuid>` in the server env.
