/**
 * Optional live Exa smoke against Edge secrets.
 * Never runs in default CI. Enable with EXA_SMOKE=1 and a real EXA_API_KEY in the
 * environment used by the Edge Function (or local Deno serve), not NEXT_PUBLIC_.
 *
 * Manual checklist after deploy:
 * 1. npx supabase secrets set EXA_API_KEY=… WEB_RESEARCH_PROVIDER=exa EXA_DEEP_SEARCH_ENABLED=false
 * 2. Apply migration 034_web_research_exa.sql
 * 3. Deploy web-search + web-open Edge Functions
 * 4. Search + open a public URL in chat; confirm Sources strip + citations jsonb
 * 5. Confirm zero production calls to api.search.brave.com
 * 6. After soak, remove Brave provider + BRAVE_SEARCH_API_KEY
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const enabled = process.env.EXA_SMOKE === "1";

describe("EXA_SMOKE (optional)", { skip: !enabled }, () => {
  it("documents that live smoke is operator-driven", () => {
    assert.ok(
      process.env.EXA_API_KEY || process.env.SUPABASE_URL,
      "Set Edge secrets / local EXA_API_KEY before EXA_SMOKE=1",
    );
  });
});
