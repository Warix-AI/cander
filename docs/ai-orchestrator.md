# AI Turn Orchestrator

Canonical paths:

| Host | Normal chat (FM available) | Vision / Build / complex |
|------|---------------------------|--------------------------|
| Mac / iOS | `runLocalTurnOrchestrator` → FM + Cander tools | `runOrchestratedTurn` → Edge V2 |
| Web / no FM | `runOrchestratedTurn` → Edge V2 | same |

```
User → Context → Turn Orchestrator → FM (reason) ⇄ Cander tools (web.search, web.open, …) → validate → answer
```

## Apple-first turn environment (small-model compiler)

Local FM turns compile a `TurnProfile` (`lib/ai/turn-environment/`) **before** every Apple FM request. The ~3B model does not orchestrate Cander — the runtime does.

Four paths:

```text
Simple
User → Context → FM → Stream

Obvious retrieval
User → Context → Pre-run tools in parallel (timeouts / cancel late branches)
     → Normalize (provenance-preserving)
     → FM synthesis
     → Stream

Ambiguous (blocking)
User → Context
     → compiler sets clarificationRequired
     → FM constructs smallest allowed clarification
     → user resumes same pending turn

Model-chosen tool
User → Context → FM
     → allowed tool(s) (0–5 cards)
     → normalize
     → FM
     → answer
     MAX 2 rounds
```

Key rules:

- **Budget profiles** (`on_device_small` ≈ 4k tokens initially, `on_device_large`, `pcc`) — not a hardcoded architecture constant
- **≤5 tools** exposed (prefer 0–3); domain gating via `resolveAllowedToolsForTurn`
- **Pre-run bypasses FM** for live-info / URL / browser deixis
- **`clarificationRequired` gate** — no free-form modals
- **Provenance-first citations** — `sourceId` through normalize → synthesis → Sources UI
- **Semantic blocks v1** (8 types) — optional structured output; Cander renders
- **`toDynamicProfilePayload`** ready for future Apple DynamicInstructions

Trajectory tests: `scripts/turn-environment.test.ts` and **`scripts/trajectory-eval.test.ts`** (included in `npm run test:orchestrator`).

## Conversation delta / state (multi-turn)

Cander resolves **what changed** before compiling tools:

```text
New turn → deterministic delta (high confidence?)
        ↘ no → tiny FM semantic delta (classify only; never answer)
             → ConversationDelta
             → previous State + Delta → ConversationTurnState
             → capability compiler
```

- **IR:** `lib/ai/turn-environment/conversation-types.ts` — `ConversationDelta` vs `ConversationTurnState`
- **Per-item** `ACTIVE` / `AVAILABLE` / `EXPIRED` on entities, topics, evidence, result sets
- **Stable refs** (`id`/`type`/`label`, evidence IDs, resultSet/item IDs)
- **Confidence** → clarification only for unresolved low-confidence ambiguity
- **Fixtures:** `scripts/fixtures/trajectories/` (≥100 A–Z + adversarial); catalog at `catalog.md`
- Regenerate: `npm run generate:trajectories`
- Run suite on every orchestration change: `npm run test:orchestrator`

## Flags

| Flag | Default | Meaning |
|------|---------|---------|
| `NEXT_PUBLIC_AI_AGENT_ORCHESTRATOR` | on | Use Edge agent vs legacy client agent-turn |
| `AI_ORCHESTRATOR_V2` (Edge) | on | V2 loop vs V1 retrieve-once pipeline |
| `NEXT_PUBLIC_AI_ORCHESTRATOR_V2` | on | Client requests `orchestratorVersion: v2` |

Set any to `0`/`false`/`off` to roll back that layer.

## Local FM orchestrator (Apple-first)

When `shouldUseLocalTurnOrchestrator()` is true:

- **TurnProfile compiler** — capability filter, pre-run tasks, clarification gate, density
- **Deterministic pre-run** — live-info / URLs / browser refs run before FM synthesis
- **Evidence + provenance** — `lib/ai/orchestrator/evidence.ts` + `turn-environment/normalize.ts`
- **Grounding validator** — fail-closed / anti-hedge when evidence exists
- **ToolExecutionBus** — real progress events only
- **Structured FM output** — native `generateStructured` (@Generable) when bridge supports it; else JSON-in-prose fallback

Client `web.search` / `web.read` / `web.open` → Edge → Exa (`WEB_RESEARCH_PROVIDER=exa`). Legacy direct fetch only if `WEB_OPEN_DIRECT_FETCH_ENABLED=true`.

## V2 loop (cloud — what changed)

```
memory retrieval → controller → web_search → web_open → evidence briefing → answer → validate
        ↑__________________________________________________________________________|
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

## Layered memory (just-in-time retrieval)

Each turn assembles context from **five layers** — the model is never expected to remember everything itself:

| Layer | What | When |
|-------|------|------|
| **1. Recent verbatim** | Newest ~20 turns, 45% token reserve | Always |
| **2. Structured working memory** | `conversation_state`: active entity/topic, entities, lists, references, facts, decisions | Always (JSON in system context) |
| **3. In-chat history search** | Keyword retrieval over older messages in this chat | Auto when pronouns, ordinals, temporal callbacks (“their”, “what you said earlier”) |
| **4. Cross-chat / Space memory** | `ai_chat_memory_index` FTS + project ref overlap | Auto when user hints at other chats; scoped workspace → project → owner |
| **5. Live / knowledge evidence** | Web search, workspace knowledge, tool results | Controller loop |

On the **local FM path**, memory snippets are auto-injected into the context packet when available; a memory **tool** is only exposed for explicit deep references (“find what I said three months ago”).

Reference resolution runs **before** the controller loop:

- “their sandbox program” → resolves to `activeEntity` (e.g. Vercel) → enriches request + triggers entity follow-up web search
- “the second option” → `recentLists` ordinal resolution
- “is that still true?” → `activeTopic` / retrieved older turns

After each turn, `buildMemoryDelta` updates `conversation_state` and upserts `ai_chat_memory_index` for cross-chat retrieval.

## Product rule

The **model does not decide** whether Cander has internet. The orchestrator owns capabilities and iteration. Training cutoffs must not appear when retrieval is available.

## Tests

```bash
npm run test:orchestrator
```

## Streaming

V2 supports progressive NDJSON via `action: "run_turn_stream"`:

- Events: `turn.started`, `status`, `turn.completed` / `turn.paused` / `turn.failed` / `turn.cancelled`
- Client uses authenticated `fetch` (`runAgentTurnStream`) so Thinking UI updates mid-turn
- Falls back to classic `run_turn` if streaming is unavailable

Token-level answer deltas still depend on bridge streaming (not required for live status).

## Remaining limits

- Cross-chat retrieval uses keyword + Postgres FTS on the memory index (pgvector semantic search is a future upgrade)
- Answer quality still depends on configured Ollama models (`OLLAMA_ANSWER_MODEL`)
- V1 orchestrator remains as emergency fallback only (`AI_ORCHESTRATOR_V2=0`)
- Native Apple DynamicInstructions wiring uses `toDynamicProfilePayload` when OS support is ready
