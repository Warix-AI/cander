# Connector baseline report

Generated as part of Composio Gmail integration Phase 0.

## Local verification (2026-09-01)

| Check | Result |
|-------|--------|
| `npm run test:connectors` | Pass (unit tests) |
| `npm run test:security` | Pass |
| `npm run test:usage` | Pass |
| `npm run check:migrations` | Pass |

## Staging migration 039

Staging Supabase access is available. Verify `039_connector_hardening.sql` is applied before pilot:

```sql
select to_regclass('public.connector_connections') is not null as has_connections;
select to_regclass('public.connector_audit_events') is not null as has_audit;
```

Migration `040_connector_composio_prep.sql` must be applied before Composio OAuth (oauth states, reconcile RPC, webhook receipts).

## Architecture baseline

- Owner-scoped `connector_connections` with RLS (migration 039)
- Server API routes under `app/api/connectors/`
- `getConnectorProvider()` returns Composio adapter when `COMPOSIO_API_KEY` + `COMPOSIO_GMAIL_AUTH_CONFIG_ID` are set
- OAuth activation only via `GET /api/connectors/oauth/verify` + `complete_auth`
- Client cannot promote to `active` (trigger + reconcile RPC)

## Isolation probe extensions

`scripts/security-isolation-probe.ts` includes connector probe placeholders for:

- Callback identity verification (manual staging)
- Callback replay rejection
- Wrong-user callback rejection
- Webhook replay idempotency

Run live probes with workspace credentials:

```bash
OWNER_EMAIL=... OWNER_PASSWORD=... \
MEMBER_EMAIL=... MEMBER_PASSWORD=... \
OUTSIDER_EMAIL=... OUTSIDER_PASSWORD=... \
WORKSPACE_ID=ws-... \
npm run test:isolation
```

## Blockers before Gmail enablement

1. Composio Gmail auth config not yet created
2. Composio callback verifier URL not yet registered
3. Staging end-to-end OAuth not yet executed
4. Gmail catalog remains `coming_soon` until checklist passes
