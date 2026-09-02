# New connector checklist (Composio)

Use this for every connector after Gmail (Slack, Notion, Linear, etc.). Gmail is the reference implementation.

## 1. Composio dashboard

- [ ] Create auth config for the toolkit in Composio
- [ ] Note tool slugs Composio exposes (read vs write)
- [ ] Register webhook URL: `https://<host>/api/connectors/webhooks/composio`
- [ ] Register callback verifier URL: `https://<host>/api/connectors/oauth/verify` (must match env exactly)

## 2. Vercel environment (server-only)

Shared (one per project):

| Variable | Purpose |
|----------|---------|
| `COMPOSIO_API_KEY` | Composio project API key |
| `COMPOSIO_WEBHOOK_SECRET` | Webhook HMAC verification |
| `COMPOSIO_CALLBACK_VERIFIER_URL` | Must match Composio dashboard |

Per connector:

| Variable | Example |
|----------|---------|
| `COMPOSIO_{SLUG}_AUTH_CONFIG_ID` | `COMPOSIO_SLACK_AUTH_CONFIG_ID` |

Never use `NEXT_PUBLIC_` for Composio secrets.

Redeploy after env changes.

## 3. Database

- [ ] Add row to `connector_catalog` (or migration seed) with `enabled = false`, `coming_soon = true`
- [ ] Confirm migrations 039–041 applied on target environment

## 4. Server code (`lib/connectors/`)

Copy and adapt from Gmail:

| File | Changes |
|------|---------|
| [`composio-http.ts`](../../lib/connectors/composio-http.ts) | Auth config resolver for new slug; `createConnectLink` branch |
| [`composio-tools.ts`](../../lib/connectors/composio-tools.ts) | Tool slug map, argument mapping, output redaction |
| [`tool-execute.ts`](../../lib/connectors/tool-execute.ts) | Connection resolve + execute branch |
| [`tool-authz.ts`](../../lib/connectors/tool-authz.ts) | Explicit read/write allowlist per action |
| [`lifecycle.ts`](../../lib/connectors/lifecycle.ts) | Remove hardcoded `gmail`-only guards for new id |
| [`provider/composio-adapter.ts`](../../lib/connectors/provider/composio-adapter.ts) | `beginAuthorization` for new connector |
| [`mapper.ts`](../../lib/connectors/mapper.ts) | Ensure no secrets in DTO |

Identity mapping (unchanged): `cander:{workspaceId}:{profileId}` per [`composio-identity.ts`](../../lib/connectors/composio-identity.ts).

## 5. API routes

Existing routes are connector-agnostic except tool name validation:

- [ ] Extend `isGmailConnectorTool` / execute route to accept new tool names
- [ ] Rate limits already apply per category

## 6. AI integration (`lib/ai/`)

| File | Changes |
|------|---------|
| [`tools/domains.ts`](../../lib/ai/tools/domains.ts) | Intent detection for new connector |
| `lib/ai/connectors/{name}-turn.ts` | Turn loop (copy `comms-turn.ts` pattern) |
| [`connector-response.ts`](../../lib/ai/connectors/connector-response.ts) | Empty-result copy + jargon filter |
| [`runtime/agent-turn.ts`](../../lib/ai/runtime/agent-turn.ts) | Route intent to new turn |
| [`tool-protocol.ts`](../../lib/ai/tool-protocol.ts) | Add tools to `KNOWN_TOOLS` |

Rules for AI replies: [`CONNECTOR_USER_VOICE_RULES`](../../lib/ai/connectors/connector-response.ts) — never mention tools, APIs, or connectors in user-visible text.

## 7. Security tests

- [ ] Unit tests for `tool-authz` allowlist (deny write actions by default)
- [ ] Unit tests for output redaction (no tokens in formatted output)
- [ ] Extend `connector-security.test.ts` if new client import paths
- [ ] Run `npm run test:connectors` and `npm run test:security`
- [ ] Run `npm run test:isolation` on staging with owner/member/outsider

## 8. Staging E2E

- [ ] Connect as User A → active
- [ ] User B same workspace connects own account → both active, isolated
- [ ] User B cannot list/disconnect User A's connection (404)
- [ ] AI question returns only connecting user's data
- [ ] OAuth callback replay + wrong-user rejected
- [ ] Webhook signature + replay idempotent
- [ ] Disconnect revokes provider before UI shows disconnected

## 9. Enablement

Only after all checks pass:

```sql
update public.connector_catalog
set enabled = true, coming_soon = false
where id = '<connector_id>';
```

## 10. Production

- [ ] Repeat env vars on Production Vercel project
- [ ] Re-run isolation probe against production Supabase (read-only cases)
- [ ] Explicit approval before catalog enable SQL on production
