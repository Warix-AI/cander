# Build create — cost & architecture report

Tree-removal website generation that succeeded after commit `143e1ca`.

**Sources:** [`lib/ai/build/project-turn.ts`](../lib/ai/build/project-turn.ts), [`lib/usage/plan-config.ts`](../lib/usage/plan-config.ts), OpenAI public pricing (Sep 2026).

**Caveat:** Token-level OpenAI spend for that exact turn is not stored in the DB. OpenAI dollars below are path + pricing estimates. Cander’s `usage_events` ledger is **fair-use request weights**, not a provider invoice.

---

## Verdict

| Layer | What you “paid” |
| --- | --- |
| **Cander usage ledger (Free weights)** | **~$0.00405** typical (1× `ai_chat` + 2× `sandbox_runtime`) |
| **OpenAI (real)** | **~$0.0003–0.002** — one small `gpt-5.6-luna` JSON invent call |
| **Codex (`gpt-5.3-codex`)** | **$0** — not used on create happy path |
| **Vercel Sandbox + npm** | **Largest real cost, not in ledger** — ensure + forceRestart recreate |

Create worked because writes now keep `projectId`/`workspaceId` (await nested turns + reinject after tool schema strip). Scaffold is **deterministic Next SSR**, not a Codex coding loop.

---

## Step-by-step backend path

```
User: “create me a website for a tree removal business…”
  └─ runAssistantTurn
       └─ runBuildProjectTurn (create intent)
            ├─ 1. ensureSandboxReady
            │     ├─ POST …/infra/ensure  → subdomain + GitHub repo + cander/draft
            │     └─ POST …/sandbox/ensure → Vercel Sandbox clone  [bill: sandbox_runtime]
            ├─ 2. inventFunnelCopy
            │     └─ POST /api/ai/raw-openai (modelMode: chat → gpt-5.6-luna)
            │           [bill: ai_chat + OpenAI tokens]
            ├─ 3. scaffoldFiles (7 files in memory)
            ├─ 4. writeScaffold ×7
            │     └─ computer.files.write → sandbox write + persist:true
            │           → GitHub commit per file on cander/draft
            └─ 5. ensureSandboxReady(forceRestart: true)  [silent]
                  destroy → reclone tip → npm install → next dev
                  [bill: sandbox_runtime + Vercel compute]
```

| # | Step | External systems | Billable in Cander? | Cost signal |
| --- | --- | --- | --- | --- |
| 1 | Route to Build turn | — | No | — |
| 2 | Infra ensure | Supabase, GitHub App | No usage feature | Ledger $0 |
| 3 | Sandbox ensure #1 | Vercel Sandbox | `sandbox_runtime` | $0.002 internal + compute |
| 4 | Invent copy (LLM) | OpenAI chat model | `ai_chat` | ~$0.0003–0.002 OpenAI |
| 5 | Write 7 files + persist | Sandbox + GitHub | Unmetered | **7 draft commits** |
| 6 | Force-restart sandbox | Vercel Sandbox, npm | `sandbox_runtime` | $0.002 + compute |
| 7 | Live preview | `draft--{sub}.cander.app` → sandbox :3000 | Provider runtime | Dominant unknown |

### Scaffold written

| Path | Purpose |
| --- | --- |
| `.gitignore` | ignore `node_modules`, `.next`, etc. |
| `package.json` | `next@16.3.1`, `react@19`, `dev` on `:3000` |
| `next.config.mjs` | empty config |
| `app/layout.js` | SSR metadata / OG / robots |
| `app/page.js` | Funnel landing (server component) |
| `app/robots.js` | allow crawl |
| `app/sitemap.js` | index `/` |

Progress the user sees: Thinking → Starting project sandbox → Planning copy… → Updating / Writing `{path}` ×7 → final markdown (no “Restarting preview…” after `143e1ca`).

---

## Cost breakdown

### A. Cander `usage_events` (Free plan weights)

| Meter | Units | Weight | USD |
| --- | --- | --- | --- |
| `ai_chat` | 1 | 50 micros | $0.00005 |
| `sandbox_runtime` | 2 (ensure + restart) | 2000 × 2 | $0.00400 |
| **Total** | | **4050 micros** | **~$0.00405** |

- Pro/Max: `ai_chat` weight is 100 micros → still ~**$0.0041**.
- Opening BuildPanel before chat can add a **third** `sandbox_runtime` (+$0.002).
- Feature `coding_agent` exists in plan config but **no route reserves it**; coding traffic is still billed as `ai_chat`.

### B. OpenAI (estimated)

| Model | List price (short) | Role this create |
| --- | --- | --- |
| `gpt-5.6-luna` (`OPENAI_MODEL`) | ~$0.20 / 1M in · $1.20 / 1M out | `inventFunnelCopy` only |
| `gpt-5.3-codex` | ~$1.75 / 1M in · $14 / 1M out | **Not called** |

Rough invent call: hundreds of input tokens + ~100–200 output JSON → **well under a cent**, typically **fractions of a millicent to ~$0.002** if history/system prompt is large.

Tokens are logged as `[RAW_OPENAI_TRACE]` / response fields — **not** written onto `usage_events.actual_cost_micros` or `ai_chats`.

### C. Infra outside the ledger

| System | Metered in-app? | Notes |
| --- | --- | --- |
| Vercel Sandbox create/recreate + `npm install` + `next dev` | Weight only (`sandbox_runtime`) | Real $ is provider compute — usually **>>** OpenAI for this path |
| GitHub App (repo + 7 commits + clones) | No | Cheap at this volume vs sandbox |
| `infra/ensure`, file write API | No | — |
| Publish / production deploy | `sandbox_deploy` | **Not** on first create |

---

## What went well

1. **Writes succeed** after the turn-context / ID-reinjection fix.
2. **No code dump in chat** — files land in the sandbox/GitHub draft.
3. **Deterministic create** — predictable cost; no multi-round Codex loop.
4. **Crawlable first site** — App Router SSR + metadata + robots + sitemap.
5. **GitHub draft as source of truth** before publish to `{sub}.cander.app`.
6. **Clear write progress** (“Writing `app/page.js`…”).

---

## Inefficiencies (ranked)

| Issue | Impact | Improvement |
| --- | --- | --- |
| **7 GitHub commits** (persist per file) | Latency + GitHub/Vercel I/O ×7 | Batch writes → **one** `persist` |
| **`forceRestart` reclone + npm install** | Largest wall-clock + sandbox $ | Start `next-dev` on **same** sandbox after writes |
| **Redundant infra/sandbox ensures** | Panel + turn + each write + restart | One warm session for the turn |
| **`inventFunnelCopy` always calls OpenAI** | Extra RTT; heuristics already exist | Skip LLM for simple creates / templates |
| **Usage ≠ real $** | Can’t price a generation accurately | Store **tokens + `projectId`** on `ai_chat` events |
| **Codex unused on create** | Good for cost; weak for unique design | Plan → Codex only when user wants custom UI |

### Suggested order of attack

1. Batch file writes → single GitHub persist.  
2. Drop forceRestart; run `next-dev` after `package.json` lands.  
3. Persist OpenAI tokens + `projectId` on usage events.  
4. Keep Codex off default create until design complexity needs it.

---

## How this differs from “Codex builds everything”

Product narrative often sounds like: plan → Codex implements → sandbox.

**Actual create happy path today:**

1. Chat model invents marketing JSON.  
2. **Local TypeScript** builds the Next scaffold.  
3. Tools write + GitHub persist.  
4. Sandbox restart for preview.

Codex runs only on **non-create** implement/refine loops (`modelMode: "coding"`), up to 10 tool rounds — those can be much more expensive (`ai_chat` × N + heavier tokens at Codex rates).

---

## How to attribute the next generation exactly

```sql
-- Sandbox ensures for the project
select id, feature_category, model, estimated_cost_micros, actual_cost_micros,
       metadata, created_at
from public.usage_events
where feature_category = 'sandbox_runtime'
  and metadata->>'projectId' = '<project_id>'
order by created_at desc
limit 20;

-- Nearby AI calls (no projectId on metadata today — correlate by time/workspace)
select id, feature_category, model, units, estimated_cost_micros, created_at
from public.usage_events
where workspace_id = '<workspace_id>'
  and feature_category = 'ai_chat'
  and created_at > now() - interval '1 day'
order by created_at desc
limit 50;
```

Internal $ ≈ `sum(coalesce(actual_cost_micros, estimated_cost_micros)) / 1e6`.  
True OpenAI $ ≈ tokens from logs × list prices above.

---

## Bottom line

For this tree-removal test create you mostly “spent”:

- **~$0.004** against Cander’s Free usage budget  
- **Sub-cent OpenAI** for copy invent  
- **Most of the real money/time** in **Vercel Sandbox recreate + install**, amplified by **7 commits** and **forceRestart**

The generation path is now **correct and cheap on LLM**. The next efficiency wins are **infra orchestration**, not model choice.
