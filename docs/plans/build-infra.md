# Build platform — approved implementation plan

**Status:** Approved 2026-09-08. Phases 0–10 landed.

## Stance

Backend infrastructure behind existing Apps / Websites UX. Warix-managed GitHub, Vercel, Supabase. Minimal UI for operational states only.

## Phases

0. Platform credentials + SDK scaffolding — **done**
1. Persistent GitHub repo + subdomain — **done**
2. Vercel Sandbox lifecycle from git — **done**
3. AI ↔ sandbox + commit/push draft — **done**
4. Per-app Supabase (Warix Management API) — **done**
5. Live preview proxy — **done**
6. Revisions = git SHAs — **done**
7. Publish → Vercel production deploy — **done**
8. `*.cander.app` routing (production hosts) — **done**
9. Reliability / security cleanup — **done**
10. Custom domains foundation — **done**

## Docs

- [build-infra runbook](../runbook/build-infra.md)
