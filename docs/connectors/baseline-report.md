# Connector baseline report

Generated as part of Composio connector security audit (staging-first).

## Audit snapshot (2026-09-02)

| Check | Result |
|-------|--------|
| Commit | `2be3a73` (+ audit hardening) |
| `npm run test:connectors` | Pass (49+ tests) |
| `npm run test:security` | Pass |
| `npm run test:usage` | Pass (run in CI) |
| `npm run check:migrations` | Pass (run in CI) |
| `npm run build` | Pass |
| Full audit report | [security-audit-report.md](./security-audit-report.md) |
| New connector template | [new-connector-checklist.md](./new-connector-checklist.md) |

## Staging environment checklist

| Variable | Required |
|----------|----------|
| `COMPOSIO_API_KEY` (or `COMPOSIO_KEY`) | Yes |
| `COMPOSIO_GMAIL_AUTH_CONFIG_ID` | Yes (Gmail pilot) |
| `COMPOSIO_WEBHOOK_SECRET` | Yes |
| `COMPOSIO_CALLBACK_VERIFIER_URL` | Yes — must match Composio dashboard |

## Staging migration probes

```sql
select to_regclass('public.connector_connections') is not null as has_connections;
select to_regclass('public.connector_audit_events') is not null as has_audit;
select to_regclass('public.connector_oauth_states') is not null as has_oauth_states;
select to_regclass('public.connector_webhook_receipts') is not null as has_webhook_receipts;
```

Migrations **039**, **040**, and **041** must be applied before Composio OAuth.

## Architecture baseline

- Owner-scoped `connector_connections` with RLS (migration 039)
- Server API routes under `app/api/connectors/`
- `getConnectorProvider()` returns Composio adapter when `COMPOSIO_API_KEY` + `COMPOSIO_GMAIL_AUTH_CONFIG_ID` are set
- OAuth activation only via `GET /api/connectors/oauth/verify` + `complete_auth`
- Client cannot promote to `active` (trigger + reconcile RPC)
- Personal connections: **one Gmail per user per workspace** — not shared between workspace members

## Isolation probe

```bash
OWNER_EMAIL=... OWNER_PASSWORD=... \
MEMBER_EMAIL=... MEMBER_PASSWORD=... \
OUTSIDER_EMAIL=... OUTSIDER_PASSWORD=... \
WORKSPACE_ID=ws-... \
npm run test:isolation
```

Extended probes: member cannot see owner's connector rows; outsider sees zero rows.

## Blockers before Gmail enablement

1. Staging Composio env vars confirmed on Vercel
2. Staging end-to-end OAuth + webhook probes (see [gmail-pilot-checklist.md](./gmail-pilot-checklist.md))
3. Isolation probe pass on staging
4. Gmail catalog remains `coming_soon` until checklist passes
