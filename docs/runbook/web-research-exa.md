# Web research (Exa) — operator notes

## Secrets (Edge only)

`.env.local` does **not** configure deployed Supabase Edge Functions.

```bash
npx supabase secrets set EXA_API_KEY=…
npx supabase secrets set WEB_RESEARCH_ENABLED=true
npx supabase secrets set WEB_RESEARCH_PROVIDER=exa
npx supabase secrets set EXA_DEEP_SEARCH_ENABLED=false
npx supabase secrets set WEB_RETRIEVAL_MODE=deep_default
npx supabase secrets set WEB_OPEN_DIRECT_FETCH_ENABLED=false
```

`WEB_RETRIEVAL_MODE` (Edge) / `NEXT_PUBLIC_WEB_RETRIEVAL_MODE` (client):

| Value | Behavior |
|-------|----------|
| `deep_default` (default) | Open-web factual/current → Exa `deep` search type. URL inspect stays direct `web.read`. |
| `fast` | Prior lightweight one-shot policy (benchmark once INTERPRET is stronger). |
| `auto` | Floor at Exa `auto`. |

Never set `NEXT_PUBLIC_EXA_*`. Never commit real keys.

## Deploy order

1. Apply `supabase/migrations/034_web_research_exa.sql`
2. Deploy Edge Functions (`web-search`, `web-open`, agent turn)
3. Deploy Next app
4. Enable Exa in **dev → preview → prod** via `WEB_RESEARCH_PROVIDER=exa`
5. Monitor `web_research_usage` / `web_research_events` for latency, errors, `cost_dollars_micros`
6. Confirm **zero** calls to `api.search.brave.com`
7. After soak: delete `brave-provider.ts` + unset `BRAVE_SEARCH_API_KEY`

## Rollback

Set `WEB_RESEARCH_PROVIDER=brave` only as an explicit ops action (requires `BRAVE_SEARCH_API_KEY`).
Exa failures must **not** auto-flip the provider.

## Optional smoke

```bash
EXA_SMOKE=1 node --experimental-strip-types --test scripts/exa-smoke.test.ts
```
