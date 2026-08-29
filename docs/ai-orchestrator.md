# AI Turn Orchestrator

Canonical path: **Cap / web / desktop** → `runOrchestratedTurn` → Edge `ai-agent` (`run_turn`) → **Orchestrator V2** (bounded autonomous loop) → `ModelProvider` (Ollama/bridge).

## Flags

| Flag | Default | Meaning |
|------|---------|---------|
| `NEXT_PUBLIC_AI_AGENT_ORCHESTRATOR` | on | Use Edge agent vs legacy client agent-turn |
| `AI_ORCHESTRATOR_V2` (Edge) | on | V2 loop vs V1 retrieve-once pipeline |
| `NEXT_PUBLIC_AI_ORCHESTRATOR_V2` | on | Client requests `orchestratorVersion: v2` |

Set any to `0`/`false`/`off` to roll back that layer.

## V2 loop (what changed)

```
controller → web_search → web_open → evidence briefing → answer → validate
                ↑______________________________________________|
```

- Capability manifest (web/knowledge/tools/location/time)
- Structured controller decisions (not one-shot regex routing)
- SSRF-safe `web_open` page reads
- Evidence briefing before final prose
- Deterministic + optional model answer validator (retrieve_more / regenerate)
- Working memory lists for “the second one”
- Knowledge via `paused_for_client` when server decides
- Purpose-specific Ollama models (`OLLAMA_CONTROLLER_MODEL`, `OLLAMA_ANSWER_MODEL`)

V1 remains as fallback code path (not a third permanent stack).

## Product rule

The **model does not decide** whether Cander has internet. The orchestrator owns capabilities and iteration. Training cutoffs must not appear when retrieval is available.

## Tests

```bash
npm run test:orchestrator
```

## Remaining limits

- True SSE/token streaming still pending (status events still returned with the HTTP response; UI maps them when the call completes). Prefer next: `run_turn_stream` NDJSON.
- Small local models still limit synthesis quality — use stronger `OLLAMA_ANSWER_MODEL` when available.
- Semantic/pgvector history not required for V2; keyword + working memory first.
- Knowledge still executes on-device when server pauses for `knowledge.search`.
