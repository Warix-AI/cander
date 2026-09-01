# Gmail pilot checklist

Complete every item on **staging** before enabling Gmail in `connector_catalog`.

## Infrastructure

- [ ] Migration `039_connector_hardening.sql` applied
- [ ] Migration `040_connector_composio_prep.sql` applied
- [ ] Migration `041_connector_oauth_resilience.sql` applied
- [ ] `COMPOSIO_API_KEY` set (server only)
- [ ] `COMPOSIO_GMAIL_AUTH_CONFIG_ID` set
- [ ] `COMPOSIO_WEBHOOK_SECRET` set
- [ ] `COMPOSIO_CALLBACK_VERIFIER_URL` matches Composio dashboard exactly
- [ ] Webhook URL registered: `https://<staging-host>/api/connectors/webhooks/composio`

## Security probes

- [ ] Two-user RLS isolation (`npm run test:isolation`)
- [ ] Connector unit tests (`npm run test:connectors`)
- [ ] Cross-user connection access returns uniform 404
- [ ] Duplicate initiate reuses single pending connection

## OAuth callback identity

- [ ] Full Gmail OAuth end-to-end on staging
- [ ] Callback with valid `session_uri` + correct Cander user activates bound connection only
- [ ] Callback replay (same `session_uri` twice) rejected / no double activate
- [ ] Concurrent duplicate callbacks do not call Composio twice
- [ ] Interrupted callback (processing lease expired) recovers without re-OAuth when provider is ACTIVE
- [ ] Callback with wrong Cander user session rejected; connection not active
- [ ] No secrets in browser responses, localStorage, logs, or audit metadata

## Webhooks

- [ ] Signed webhook accepted
- [ ] Webhook replay (duplicate `webhook-id`) idempotent no-op

## Native return flows

- [ ] Web browser: OAuth return to connectors UI with cookie session
- [ ] Electron WebView: OAuth return to connectors UI
- [ ] Capacitor iOS/Android: OAuth return (implement deep link if cookies fail)

**Pilot blocker:** Electron and Capacitor shells load hosted web and depend on same-origin cookie sessions for `GET /api/connectors/oauth/verify`. If native OAuth return cannot restore the Cander session cookie, implement a universal link / custom URL scheme handoff before enabling Gmail. Do not assume the web callback flow covers native shells without staging proof.

## Disconnect

- [ ] Provider revoke confirmed before UI shows disconnected
- [ ] Provider failure does not false-positive disconnect in UI

## Enablement

Only after all checks pass:

```sql
update public.connector_catalog
set enabled = true, coming_soon = false
where id = 'gmail';
```

Do not enable in production without explicit approval.
