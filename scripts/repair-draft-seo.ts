/**
 * One-shot: repair draft SEO for a project via GitHub App.
 *   npx tsx --env-file=.env.local scripts/repair-draft-seo.ts <projectId>
 */

import { ensureDraftSeoArtifacts } from "../lib/build/git/ensure-draft-seo.ts";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const projectId = process.argv[2]?.trim();
  if (!projectId) throw new Error("usage: repair-draft-seo.ts <projectId>");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("projects")
    .select("id, workspace_id, title, draft_sha")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "project not found");
  const result = await ensureDraftSeoArtifacts({
    projectId: data.id,
    workspaceId: String(data.workspace_id),
  });
  console.log(
    JSON.stringify(
      {
        title: data.title,
        repaired: result.repaired,
        draftSha: result.draftSha,
        priorSha: data.draft_sha,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
