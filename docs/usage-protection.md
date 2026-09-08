# Usage protection architecture

Cander centralizes plan limits, durable usage accounting, distributed rate limiting, cost safeguards, Codex readiness hooks, and rich AI response validation in `lib/usage/`.

## What exists today

| Layer | Location |
| --- | --- |
| Plan matrix (Free / Pro / Max) | `lib/usage/plan-config.ts` |
| Account monthly $ periods | `supabase/migrations/060_account_usage_periods.sql`, `lib/usage/account-period.ts` |
| Enforcement entrypoint | `lib/usage/enforce.ts` |
| Route helper | `lib/usage/server/guard-route.ts` |
| Workspace + plan resolution | `lib/usage/server/context.ts` |
| Postgres event ledger | `supabase/migrations/038_usage_protection.sql` |
| Memory store (tests/local fallback) | `lib/usage/store/memory-store.ts` |
| Kill switches | `lib/usage/kill-switches.ts` |
| Customer usage UI | Settings Usage + General popup via `/api/usage/status` |
| Usage status API | `app/api/usage/status/route.ts` |

## Account spend (single meter)

- Billing plan is per **profile** (seat). Workspaces under that account **share one** monthly usable-dollar budget.
- Example: Pro bill `$20` → `usableBudgetMicros` `$15` (`plan-config` v3). Max: `$50` bill → `$40` usable. Free: `$1` usable.
- Paid actions reserve estimated cost on `account_usage_periods`, journal to `usage_events` (with `period_id` in metadata), then confirm/release on finalize.
- Hard stop when `spent + reserved >= usable_budget`. Workspace rate/concurrency ceilings remain as abuse controls.
- `/api/usage/status` returns `accountSpend.percentUsed` for Settings + General popup (no demo hourly % when a live snapshot exists).
- Max org seats: **per seat/profile** pool (not one org-wide pool yet).

## Enforcement flow

1. Authenticate request
2. Resolve workspace membership + billing plan
3. Check feature entitlement from centralized plan config
4. Apply rate, concurrency, monthly fair-use, and workspace cost ceilings
5. Reserve against **account** usable budget (when periods table is available)
6. Reserve usage in the durable ledger (`usage_events`)
7. Execute paid work
8. Reconcile reservation as `confirmed`, `released`, or `failed` (adjusts account period)

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
| `USAGE_ENFORCEMENT_ENABLED` | Master switch (default **on**; set `false`/`0`/`off` to bypass) |
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

## Approved plan limits (v2)

Limits in `lib/usage/plan-config.ts` are approved for launch:

- **Free:** 150 AI chat/month, 5 images/month, 20 web research/month, tight rate limits; knowledge/sandbox deploy/coding disabled
- **Pro / Max:** fair-use unlimited monthly units with rate + cost ceilings; coding agent still off until `CODING_AGENT_ENABLED=1`
- **Cost ceilings:** ~$0.50/day free workspace, $15/day pro, $40/day max (micro-dollar fields)

Migration `038_usage_protection.sql` is applied on Supabase. Set `USAGE_ENFORCEMENT_ENABLED=true` in production env (default is on when unset).
