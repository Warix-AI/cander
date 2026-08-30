# Conversation trajectory catalog

Executable multi-turn behavior specs for Cander’s conversation delta/state pipeline.

- **Location:** `scripts/fixtures/trajectories/`
- **Harness:** `scripts/trajectory-eval.test.ts` (in `npm run test:orchestrator`)
- **Count:** ≥100 fixtures (A–Z + adversarial)
- **Rule:** Deterministic-first, semantic-second. CI uses heuristic/mock semantic — never live FM/Exa.

## Categories

| Dir | Pattern |
|-----|---------|
| A-simple-continuation | Unit follow-ups (Everest → feet) |
| B-implicit-subject | it/who/when/where ellipsis |
| C-follow-up-modifier | Geography modifiers |
| D-freshness | Timeframe corrections |
| E-dissatisfied | “No, for a tiny plumbing company” |
| F-try-again | Retry / not what I asked |
| G-expand | Longer / more detail |
| H-structure | Main points / shorter |
| I-refer-earlier | Ordinal “second one” |
| J-correction | Apple Inc → fruit |
| K-partial-correction | SLC → Provo |
| L-internal-cander | Build projects |
| M-internal-follow-up | Most recently edited |
| N-internal-external-mix | Project + SEO competitors |
| O-browser-not-memory | Closed panel ≠ forgotten evidence |
| P-task-change | Landing → dashboard |
| Q-ambiguous-resolvable | Which is cheaper? |
| R-ambiguous-unresolvable | Send it to him (clarify) |
| S-tool-autonomy | What does X do? |
| T-source-reuse | Reuters source |
| U-constraint-accumulate | Price → Mac → 14" |
| V-ellipsis | And fries? |
| W-what-about | Utah → Colorado |
| X-time-follow-up | How long until then? |
| Y-negative-constraint | Nothing from Salesforce |
| Z-response-style | Simpler / like I’m five |
| adversarial | Forget all, dual antecedents, topic A→B→A, same-name project/company |

## Regenerating

```bash
node --experimental-strip-types scripts/generate-trajectory-fixtures.ts
```

## Assert layers

1. Chained `ConversationTurnState` (entities, constraints, freshness, clarify, retrieval)
2. `compileTurnProfile` route flags
3. Answer contracts (`mustNotAskClarification`, `mustUseFreshEvidence`, …)
