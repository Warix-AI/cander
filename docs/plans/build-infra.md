# Build platform — approved implementation plan

**Status:** Approved 2026-09-08. Phase 0/1 done. Phase 2 landing.

## Stance

Backend infrastructure integration behind the existing Apps / Websites experience. Users do not need GitHub, Vercel, or Supabase accounts. Cander provisions under **Warix**. UI changes only for operational states (starting, building, preview/publish failure, domains).

## Phases

0. Platform credentials + SDK scaffolding (Octokit, Vercel REST, Supabase Management) — **done**
1. Persistent GitHub repo + subdomain on `projects` — **done**
2. Vercel Sandbox lifecycle from git — **landing**
3. AI ↔ sandbox + commit/push draft
4. Per-app Supabase (Warix Management API)
5. Live preview proxy
6. Revisions = git SHAs
7. Publish → Vercel production deploy
8. `*.cander.app` routing
9. Reliability / security cleanup
10. Custom domains foundation

## Branching

- `cander/draft` — editable tip (`draft_sha`)
- `main` — published line (`published_sha`)

## Docs

- [build-infra runbook](../runbook/build-infra.md)
