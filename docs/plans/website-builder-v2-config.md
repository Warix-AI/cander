# Website Builder V2 (config-driven) — parallel to V1

Enable with `CANDER_WEBSITE_BUILDER_V2=1` and `NEXT_PUBLIC_CANDER_WEBSITE_BUILDER_V2=1`.

**Apply migration first:** `supabase/migrations/20260911150000_website_builder_v2_config.sql`
(adds `projects.builder_version` — required before deploying this branch).

## Architecture

| | V1 | V2 (`v2_config`) |
|---|---|---|
| Create | Sandbox + coding agent | Blueprint snapshot → JSON config |
| Edit | Codex / file writes | Validated mutations |
| Preview | Vercel sandbox iframe | `BuilderV2SiteRenderer` |
| Catalog | N/A | DB tables + coded React variants by ID |

Routing is explicit: `projects.builder_version` is never ambiguous. Existing rows default to `v1`.

## Key paths

- Core: `lib/build/v2/`
- Preview: `components/build-v2/`
- API: `/api/projects/:id/builder-v2/{init,mutate}`
- Chat gate: `lib/ai/build/project-turn.ts` → `runBuilderV2ConfigTurn`
- Tests: `npm run test:builder-v2`

## Starter catalog

3 categories × 2 blueprints; ≤3 variants per component type; 3 themes / behaviors / headers / footers.

## Out of scope (intentionally)

Blueprint switching UX, drag-drop CMS, Codex for normal edits, full admin UI (schema is admin-ready).
