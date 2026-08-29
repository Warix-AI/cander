# Cander AI Bridge

Localhost-only proxy from Supabase Edge (via **HTTPS Cloudflare Tunnel**) to Ollama.

See [docs/runbook/ai-bridge.md](../../docs/runbook/ai-bridge.md).

```bash
export CANDER_AI_BRIDGE_SECRET=dev-secret
npm start
# separate terminal:
cloudflared tunnel --url http://127.0.0.1:8787
```
