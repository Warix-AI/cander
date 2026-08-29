# Cander AI Bridge runbook

Local Ollama inference for **infrastructure testing only** — not production end-user models.

## Architecture

```
Browser (JWT) → Supabase Edge Function `ai-chat`
  → HTTPS Cloudflare Tunnel
  → Cander AI Bridge (auth + rate limits on 127.0.0.1)
  → Ollama on 127.0.0.1:11434 (llama3.2)
```

**Hosted Edge Functions cannot reach `127.0.0.1`.**  
`CANDER_AI_BRIDGE_URL` must be the **public HTTPS tunnel hostname**, never localhost or a private IP.

The browser never talks to the tunnel, bridge, or Ollama.

## Environment

### Edge Function secrets (Supabase dashboard / CLI)

```bash
CANDER_AI_BRIDGE_URL=https://<your-tunnel-hostname>
CANDER_AI_BRIDGE_SECRET=<long-random-secret>
```

### Bridge host (Mac only — not NEXT_PUBLIC)

```bash
CANDER_AI_BRIDGE_SECRET=<same-secret>
OLLAMA_HOST=http://127.0.0.1:11434
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=8787
BRIDGE_RATE_LIMIT_PER_MIN=30
BRIDGE_MAX_BODY_BYTES=1048576
```

## Setup steps

1. Install [Ollama](https://ollama.com) and pull the model:
   ```bash
   ollama pull llama3.2
   ```
2. Start the bridge (binds localhost only):
   ```bash
   cd services/cander-ai-bridge
   npm install
   CANDER_AI_BRIDGE_SECRET=dev-secret npm start
   ```
3. Expose the bridge with **Cloudflare Tunnel**:
   ```bash
   cloudflared tunnel --url http://127.0.0.1:8787
   ```
   Copy the `https://…` URL.
4. Set Edge secrets to that HTTPS URL + the same secret; deploy `ai-chat`.
5. Apply migrations `025_private_ai_chat.sql` and `026_ai_chat_condensation.sql` if not already applied.

## Security checklist

- [ ] Ollama is not on the tunnel — only the bridge is
- [ ] Bridge requires `Authorization: Bearer <secret>`
- [ ] Rate limits reject spam
- [ ] Edge URL is HTTPS tunnel, not `127.0.0.1`
- [ ] Rotate secret and revoke tunnel if the hostname leaks

## Rotate secret / revoke tunnel

1. Generate a new secret; update bridge env and Edge `CANDER_AI_BRIDGE_SECRET`.
2. Restart bridge; redeploy or update Edge secrets.
3. Stop/delete the Cloudflare quick tunnel or route to revoke the old hostname.

## Ship checklist

- [ ] Migrations `025_private_ai_chat.sql` and `026_ai_chat_condensation.sql` applied (`supabase db push`)
- [ ] Edge Function `ai-chat` deployed
- [ ] Edge secrets set: public HTTPS tunnel URL + shared secret
- [ ] Ollama running with `llama3.2`; bridge on `127.0.0.1`; tunnel → bridge only
- [ ] Wrong secret against tunnel → 401; correct secret → model reply
- [ ] Signed-in owner can send/persist; second user cannot read chats
- [ ] Long chats eventually return `condensation.occurred` and show a “Chat condensed” marker
- [ ] Tunnel down → clean offline / retry in Chat UI
- [ ] `npm run test:security` green
- [ ] No `NEXT_PUBLIC_*` bridge/Ollama secrets

## Non-goals (this track)

- Production managed models / model picker
- Real tool or MCP execution
- Making legacy `threads` / `messages` owner-private (follow-up)
