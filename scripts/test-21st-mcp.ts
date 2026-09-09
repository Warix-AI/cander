/**
 * End-to-end check: 21st.dev MCP connect → tools/list → search → get_component
 * → SiteSpec-bounded retrieval with real code snippets.
 *
 * Usage:
 *   API_KEY_21ST=... npx tsx scripts/test-21st-mcp.ts
 *
 * Loads .env.local if present (does not print the key).
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  createTwentyFirstMcpClient,
  retrieveComponentsForSiteSpec,
  retrievedComponentsToScaffoldFiles,
  setActiveTwentyFirstClient,
  getTwentyFirstApiKey,
} from "../lib/ai/build/twenty-first-mcp";
import { defaultSiteSpec } from "../lib/ai/build/site-spec";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const key = getTwentyFirstApiKey();
  if (!key) {
    console.error(
      "FAIL: API_KEY_21ST (or TWENTY_FIRST_API_KEY) is not set. Add it to .env.local or the shell.",
    );
    process.exit(2);
  }
  console.log("API key present:", `${key.slice(0, 4)}…${key.slice(-4)} (len=${key.length})`);

  const client = await createTwentyFirstMcpClient();
  if (!client) {
    console.error("FAIL: could not connect to 21st MCP");
    process.exit(1);
  }
  console.log("Connected. Tools:", client.discoveredTools.join(", ") || "(none)");

  if (!client.discoveredTools.includes("search")) {
    console.warn("WARN: tools/list did not include `search` — will still try call");
  }
  if (!client.discoveredTools.includes("get_component")) {
    console.warn("WARN: tools/list did not include `get_component` — will still try call");
  }

  const hits = await client.search({
    query: "marketing landing page hero section react",
    role: "hero",
    limit: 3,
  });
  console.log(
    "Search hits:",
    hits.map((h) => ({ id: h.id, name: h.name, hasCode: Boolean(h.codeSnippet) })),
  );
  if (!hits.length) {
    console.error("FAIL: search returned 0 components");
    process.exit(1);
  }

  const full = await client.getComponent(hits[0]!.id);
  if (!full?.codeSnippet?.trim()) {
    console.error("FAIL: get_component returned no code for", hits[0]!.id);
    console.error("payload name:", full?.name);
    process.exit(1);
  }
  console.log("get_component OK:", {
    id: full.id,
    name: full.name,
    codeChars: full.codeSnippet.length,
    preview: full.codeSnippet.slice(0, 120).replace(/\s+/g, " "),
  });

  // Cache check — second search must not error and should hit cache logs
  const again = await client.search({
    query: "marketing landing page hero section react",
    role: "hero",
    limit: 3,
  });
  if (again[0]?.id !== hits[0]?.id) {
    console.warn("WARN: cache/search returned different top hit on repeat");
  }

  const spec = defaultSiteSpec(
    "Build a warm local dental clinic website with services, testimonials, FAQ, and contact form",
  );
  const retrieval = await retrieveComponentsForSiteSpec(spec, client);
  console.log("SiteSpec retrieval:", {
    connected: retrieval.connected,
    tools: retrieval.toolsDiscovered,
    selected: retrieval.components.map((c) => `${c.category}:${c.id}`),
    withCode: retrieval.components.filter((c) => c.codeSnippet?.trim()).length,
    usedFallback: retrieval.usedFallback,
  });

  const vendor = retrievedComponentsToScaffoldFiles(retrieval.components);
  console.log(
    "Vendor files that would be written:",
    vendor.map((f) => f.path),
  );

  const withCode = retrieval.components.filter((c) => c.codeSnippet?.trim());
  if (retrieval.usedFallback || withCode.length === 0) {
    console.error("FAIL: SiteSpec retrieval used fallback / no code — not real 21st components");
    process.exit(1);
  }
  if (!vendor.some((f) => f.path.startsWith("components/twenty-first/") && f.content.includes("21st.dev"))) {
    console.error("FAIL: vendor scaffold missing 21st provenance banner");
    process.exit(1);
  }

  // Ensure we're not just getting catalog stand-ins
  for (const c of withCode) {
    if (c.id.startsWith("cander.") || c.id.startsWith("21st.cander")) {
      console.error("FAIL: selected id looks like catalog stand-in:", c.id);
      process.exit(1);
    }
  }

  setActiveTwentyFirstClient(null);
  console.log("PASS: 21st MCP connected, tools discovered, real component code retrieved for SiteSpec roles.");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
