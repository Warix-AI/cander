/**
 * Disable Git auto-production deploys on every bound customer Vercel project.
 *
 *   npx tsx --env-file=.env.local scripts/disable-vercel-git-autodeploy.ts
 */

import { createClient } from "@supabase/supabase-js";
import { disableGitAutoDeployments } from "../lib/build/vercel/git-autodeploy.ts";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("projects")
    .select("id, title, vercel_project_id")
    .not("vercel_project_id", "is", null);
  if (error) throw new Error(error.message);

  const rows = data || [];
  console.log(`[migrate] projects with vercel_project_id: ${rows.length}`);
  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const id = String(row.vercel_project_id);
    const result = await disableGitAutoDeployments(id);
    if (result.ok) {
      ok += 1;
      console.log("OK", row.title, id);
    } else {
      fail += 1;
      console.warn("FAIL", row.title, id, result.detail?.slice(0, 200));
    }
  }
  console.log(`[migrate] done ok=${ok} fail=${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
