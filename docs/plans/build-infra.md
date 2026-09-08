# Build platform — approved implementation plan

**Status:** Approved 2026-09-08. Phases 0–4 landing.

## Stance

Backend infrastructure behind existing Apps / Websites UX. Warix-managed GitHub, Vercel, Supabase. Minimal UI for operational states only.

## Phases

0. Platform credentials + SDK scaffolding — **done**
1. Persistent GitHub repo + subdomain — **done**
2. Vercel Sandbox lifecycle from git — **done**
3. AI ↔ sandbox + commit/push draft — **done**
4. Per-app Supabase (Warix Management API) — **landing**
5. Live preview proxy
6. Revisions = git SHAs
7. Publish → Vercel production deploy
8. `*.cander.app` routing
9. Reliability / security cleanup
10. Custom domains foundation

## Docs

- [build-infra runbook](../runbook/build-infra.md)
