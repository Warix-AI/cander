# Usage protection & AI active minutes

Cander meters AI work in two complementary layers:

1. **User-facing unit = AI minutes** — universal active-time ledger (`ai_usage_events`)
2. **Internal economics = dollars** — request-weighted micros + `account_usage_periods` usable budget

Customers never see credits, tokens, or API spend. They see:

`7 / 10 minutes`

## Plan minute allocations (admin-editable)

Source of truth: `ai_plan_minute_configs` (seeded by migration `073`), with code defaults in `lib/usage/ai-minutes/plan-minutes-config.ts`.

| Plan | Default | Range | Internal budget default |
| --- | --- | --- | --- |
| Free | **10** | 10 | $1 |
| Pro | **50** | 10–50 | $15 |
| Max | **150** | 50–150 | $40 |
| Ultra | **500** | 200–500 | $120 |
| Enterprise | **1000+** | 501+, no hard max | $250 (custom) |

Admin API: `GET/PATCH /api/admin/ai-minutes-plans` (platform admin only via `requirePlatformAdmin` — org Owner/Admin is not enough). See `docs/admin-platform.md`.

**Period snapshots:** changing admin defaults does **not** rewrite open `account_usage_periods.included_minutes`. Only new periods pick up the new allocation. Per-account Enterprise overrides live on `profiles.ai_minutes_override`.

## Architecture

```text
AI execution
  → startAIUsageExecution / withAIUsageMeter / enforceUsageForRequest
  → ai_usage_events (raw ledger, ms precision)
  → overlap-merged aggregates (ai_usage_period_aggregates)
  → period included_minutes snapshot
  → /api/usage/status.aiMinutes → Usage bar
```

## Nested / parallel work

- Root executions (`parent_execution_id` null) → `billable_to_user = true`
- Child executions → cost recorded; do **not** inflate user-facing minutes
- Billable intervals are **merged** when overlapping

## Wired entry points

| Surface | Path | Metering |
| --- | --- | --- |
| Chat | `app/api/ai/raw-openai` | enforce → root `chat` |
| Agent v2 | `app/api/ai/agent` | enforce → root |
| Front agent | `app/api/projects/.../agent/turn` | enforce → root `website_build` |
| Project / expert agents | `lib/agents/runtime.runAgent` | start/finish → root `agent`/`expert`/`background_agent`/`automation` |
| Expert consult | via `runAgent` | root `expert` |
| Speculate draft | `app/api/ai/speculate/draft` | enforce → root `speculation` |
| Speculate warm | `.../warm` | **no AI** (route classify only) |
| Images | image-jobs, studio edit | enforce → root `image` |
| Voice | transcribe, realtime-token | enforce → root `voice` |
| Builds | build-jobs create/retry | enforce → root `app_build` |

## Tests

```bash
npm run test:usage
```
