# V6 Runtime Validation Report

Date: 2026-08-31  
Flag: `NEXT_PUBLIC_AI_V6_RUNTIME` / `cander:v6-runtime` (still **default OFF**)  
Suites: `scripts/v6-runtime.test.ts` + `scripts/v6-eval.test.ts`

## 1. Total eval cases

| Suite | Cases | Result |
|-------|------:|--------|
| `v6-runtime.test.ts` | 24 | pass |
| `v6-eval.test.ts` (scenarios 1–12 + trace) | 27 | pass |
| **Total** | **51** | **all green** |

Trajectory fixtures catalogued in `scripts/fixtures/v6-prompts.json`.

## 2. Failures found (during expansion)

1. **Refund compare routed Amazon to KB** — `policy.refund` preferred KB for all subjects.
2. **Conflict detector treated names as numbers** — empty digit strings coerced to `0`, so “John Doe” vs “Tim Cook” looked equal.
3. **Share-price asks not canonicalized** — heuristic missed `current_share_price` property.
4. **“BYU and Utah” over-split** — bare `and` splitter created false second span.
5. **Calorie multi-item under-split** — after fixing (4), “tacos and a Sprite” needed a dedicated list splitter.
6. **Early returns omitted `v6Trace`** — clarification + URL fast paths broke structural asserts.
7. **CEO+age / follow-up quantity / Everest / weather** — missing heuristics and policy rows.
8. **External vs internal policy subject** — needed web preference for named external orgs.

## 3. Fixes made (V6 only)

- Expose `v6Trace` on `runTurn` results (`webPlannedCount`, `webExecutedCount`, …).
- Live Exa via `searchWeb` with `allowWebStub` for tests/dev.
- Policy: external named subjects → web; internal → KB; geography.elevation (Everest) → model; weather.current → web.
- Canonical aliases/ontology for CEO variants, elevation, weather, share price.
- Heuristics: CEO→age scalar dep, map board ages, calorie follow-up, URL/file gates.
- Surface splitter: ask-boundary + nutrition list; no bare “and” between team names.
- Conflict: authority/newer resolution; else `conflicting` (fixed numeric false-positive).
- Materialize `request_result` subjects before dependent retrieval.
- Memory: persist `perItem` calories for “what about 5?”.

## 4. Remaining known limitations

- Web/KB providers still use **stubs** when live Exa/auth is unavailable (`allowWebStub`); production must have working `searchWeb`.
- Prior-chat / memory retrieval is **gated + injectable**; full Edge FTS / tenant index wiring is not end-to-end in these offline tests.
- Apple FM parse path is covered via injectable `generate`; device FM quality not measured here.
- Research/`deep` cloud synthesis path is adapter-only; not stress-tested with real Edge.
- Grouped retrieval (one search → many request results) is planned in `group.ts` but not yet the primary executor path.
- Citation URLs from stubs are `example.com` placeholders.

## 5. Recommendation: flip V6 to default?

**Not yet.**

Reasons:

- Offline suite is green, but live Exa + FM + tenant prior-chat paths need a short device/prod smoke (flag ON) against the fixture list.
- Grouped retrieval and richer KB/document upload flows are still thin.
- Keep Simple Turn / TaskGraph / Edge as fallback until that smoke passes.

Suggested next step: enable `NEXT_PUBLIC_AI_V6_RUNTIME=1` in a staging/desktop build, run the fixture prompts manually, then decide on default flip + old-runtime removal.
