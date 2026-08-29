# AI Turn Orchestrator

Canonical path: **Cap / web / desktop** → `runOrchestratedTurn` → Edge `ai-agent` (`run_turn`) → `TurnOrchestrator` → `ModelProvider` (Ollama/bridge).

## Feature flag

- `NEXT_PUBLIC_AI_AGENT_ORCHESTRATOR` default **on**
- Set to `0` / `false` / `off` to force the legacy client agent loop on cloud

## Phase status

| Phase | Status |
|-------|--------|
| 0 Clean history + CONTEXT_BUILD | Done — no Internal-result user rows; `toolContext` on legacy `ai-chat` |
| 1 Orchestrator + Ollama provider | Done — `ai-agent`, budgets, idempotency, cancel, search sessions, turn events, citations |
| 1 Thin client | Done — shared `lib/ai/orchestrator/run-turn.ts` |
| 2 Memory | Done — async `conversation_state`, keyword `ConversationHistoryRetriever`, reference hints |
| 3 One brain | Done — cloud defaults to orchestrator; legacy loop local/`flag=0` only |

## Verification (unit)

```bash
npm run test:orchestrator
```

Covers A/D/F/H routing, AcmeWhatever CEO → web, sufficiency, context newest-turn protection, citation stripping, history keyword search.

## Manual / live checks

- Greeting / “2+2” / explain recursion → direct answer (no Brave)
- “Who is the CEO of AcmeWhatever?” → web search attempt before IDK
- Cap retry same `turnId` → no duplicate user rows
- Cancel / new turn → no stale assistant write
- Refresh → conversational history without Internal-result blobs

## Remaining limits

- Semantic history retrieval later (interface ready)
- Extra ModelProviders when product needs them (no fake adapters)
- `conversation_state` may lag one beat behind the visible answer
- Client actions still round-trip on all devices
- Knowledge search still runs on-device and is attached as hits to `run_turn`
