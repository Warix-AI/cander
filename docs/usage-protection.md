# Usage protection architecture

Cander centralizes plan limits, durable usage accounting, distributed rate limiting, cost safeguards, Codex readiness hooks, and rich AI response validation in `lib/usage/`.

## What exists today

| Layer | Location |
| --- | --- |
| Plan matrix (Free / Pro / Max) | `lib/usage/plan-config.ts` |
| Enforcement entrypoint | `lib/usage/enforce.ts` |
| Route helper | `lib/usage/server/guard-route.ts` |
| Workspace + plan resolution | `lib/usage/server/context.ts` |
| Postgres ledger | `supabase/migrations/038_usage_protection.sql` |
| Memory store (tests/local fallback) | `lib/usage/store/memory-store.ts` |
| Kill switches | `lib/usage/kill-switches.ts` |
| Codex / coding-agent routing (disabled by default) | `lib/usage/model-routing.ts` |
| Rich response schema v2 | `lib/usage/response-format/schema-v2.ts` |
| Customer usage UI | `components/settings/UsageStatusPanel.tsx`, `ComposerUsageBar` via `/api/usage/status` |
| Usage status API | `app/api/usage/status/route.ts` |

## Enforcement flow

1. Authenticate request
2. Resolve workspace membership + billing plan
3. Check feature entitlement from centralized plan config
4. Apply rate, concurrency, monthly fair-use, and cost ceilings
5. Reserve usage in the durable ledger (`usage_events`)
6. Execute paid work
7. Reconcile reservation as `confirmed`, `released`, or `failed`

Routes currently wired:

- `app/api/ai/raw-openai/route.ts` — AI chat (+ rich response v2 parsing)
- `app/api/ai/raw-openai/image-jobs/route.ts` — image generation
- `app/api/ai/raw-openai/transcribe/route.ts` — audio transcription
- `app/api/computer/session/route.ts` — Vercel sandbox runtime (cookie auth)
- `app/api/computer/build/route.ts` — Vercel sandbox builds (cookie auth)

Web research and knowledge retrieval run inside the AI chat route (billed as `ai_chat`). Computer routes accept Supabase cookie sessions when `allowCookieAuth: true`.

Additional paid routes should call `enforceUsageForRequest()` before provider work and `finalizeUsageReservation()` afterward.

## Configuration

Plan allowances live in `lib/usage/plan-config.ts` (`USAGE_PLAN_CONFIG_VERSION`).

Environment controls:

| Variable | Purpose |
| --- | --- |
| `USAGE_ENFORCEMENT_ENABLED` | Master switch (`false` bypasses enforcement) |
| `USAGE_KILL_SWITCH_*` | Per-feature emergency blocks |
| `USAGE_GLOBAL_DAILY_CEILING_MICROS` | Platform daily spend ceiling |
| `USAGE_GLOBAL_MONTHLY_CEILING_MICROS` | Platform monthly spend ceiling |
| `CODING_AGENT_ENABLED` | Enables coding-agent model route (still no customer UI) |
| `CODING_AGENT_MODEL` / `OPENAI_CODING_MODEL` | Server-side Codex model id |

## Database

Migration `038_usage_protection.sql` adds:

- `usage_events` — idempotent reservation + reconciliation ledger
- `usage_window_counters` — distributed rolling windows
- `usage_audit_log` — allow/block/throttle audit trail
- `increment_usage_window_counter()` — atomic counter RPC

Tables are service-role only. Clients never write usage directly.

## Rich response formats

Models may return `version: 2` structured payloads validated by `validateRichResponse()`. Invalid payloads fall back to safe Markdown via `coerceRichResponse()`. Mapped UI blocks are produced through `richBlocksToChatBlocks()`.

Codex/coding-agent responses should use `job_progress`, `file_changes`, `sandbox_preview`, and `approval` blocks once that workflow ships.

## Tests

```bash
npm run test:usage
```

## Defaults needing product approval

Conservative starter limits are checked in — adjust in `plan-config.ts`:

- Free AI chat: 150 requests/month, low rate limits
- Free image generation: 5/month
- Pro/Max: fair-use unlimited monthly units with rate + cost ceilings
- Coding agent: disabled on all plans until `CODING_AGENT_ENABLED=1`
- Workspace daily cost ceilings: $0.50 free, $15 pro, $40 max (micro-dollar fields)

These numbers are intentionally conservative and should be tuned against real cost data before marketing "unlimited" language externally.
