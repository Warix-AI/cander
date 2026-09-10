/**
 * One authoritative deploy path: customer Vercel projects (repos under the
 * Cander GitHub org) must not be git-linked, otherwise every push to the draft
 * branch / main promotion mints a duplicate production build next to the
 * Deployments API build. Unlinks them and disables git auto deployments.
 *
 *   VERCEL_TOKEN=… VERCEL_TEAM_ID=… npx tsx scripts/vercel-unlink-customer-projects.ts            # dry run
 *   VERCEL_TOKEN=… VERCEL_TEAM_ID=… npx tsx scripts/vercel-unlink-customer-projects.ts --apply
 *
 * Or with the Vercel CLI login: --token-from-cli reads ~/Library/Application Support/com.vercel.cli/auth.json
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { vercelFetch } from "../lib/build/vercel/api.ts";
import { disableGitAutoDeployments } from "../lib/build/vercel/git-autodeploy.ts";

type VercelProject = {
  id: string;
  name: string;
  link?: { type?: string; repo?: string; org?: string; repoId?: number } | null;
  gitProviderOptions?: { createDeployments?: string } | null;
};

const CUSTOMER_ORG = (process.env.CANDER_GITHUB_ORG || "Warix-AI").toLowerCase();
const CUSTOMER_REPO_PREFIX = "cander-";

function loadCliToken(): string | null {
  try {
    const raw = readFileSync(
      join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"),
      "utf8",
    );
    return (JSON.parse(raw) as { token?: string }).token ?? null;
  } catch {
    return null;
  }
}

async function listProjects(): Promise<VercelProject[]> {
  const out: VercelProject[] = [];
  let until: number | null = null;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ limit: "100" });
    if (until) q.set("until", String(until));
    const res = await vercelFetch(`/v9/projects?${q}`);
    if (!res.ok) throw new Error(`list projects failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as {
      projects: VercelProject[];
      pagination?: { next?: number | null };
    };
    out.push(...(body.projects || []));
    if (!body.pagination?.next) break;
    until = body.pagination.next;
  }
  return out;
}

function isCustomerProject(p: VercelProject): boolean {
  const repo = (p.link?.repo || "").toLowerCase();
  const org = (p.link?.org || "").toLowerCase();
  if (org === CUSTOMER_ORG && repo.startsWith(CUSTOMER_REPO_PREFIX)) return true;
  return p.name.toLowerCase().startsWith(CUSTOMER_REPO_PREFIX);
}

async function unlink(projectId: string): Promise<boolean> {
  const res = await vercelFetch(`/v9/projects/${encodeURIComponent(projectId)}/link`, {
    method: "DELETE",
  });
  if (res.ok) return true;
  console.warn("  unlink failed", res.status, (await res.text()).slice(0, 200));
  return false;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.includes("--token-from-cli") && !process.env.VERCEL_TOKEN) {
    const token = loadCliToken();
    if (token) process.env.VERCEL_TOKEN = token;
  }
  if (!process.env.VERCEL_TEAM_ID) {
    throw new Error("VERCEL_TEAM_ID is required (customer projects live on the Cander team).");
  }

  const projects = await listProjects();
  const customer = projects.filter(isCustomerProject);
  const linked = customer.filter((p) => p.link?.type);
  const autoDeploy = customer.filter(
    (p) => (p.gitProviderOptions?.createDeployments || "enabled") !== "disabled",
  );

  console.log(`team projects: ${projects.length}, customer: ${customer.length}, linked: ${linked.length}, autodeploy-enabled: ${autoDeploy.length}`);
  for (const p of customer) {
    console.log(
      `- ${p.name} (${p.id}) link=${p.link?.type ? `${p.link.org}/${p.link.repo}` : "none"} createDeployments=${p.gitProviderOptions?.createDeployments ?? "default"}`,
    );
  }
  if (!apply) {
    console.log("\nDry run. Re-run with --apply to unlink + disable auto deployments.");
    return;
  }

  let unlinked = 0;
  let disabled = 0;
  for (const p of customer) {
    // Disable first so an in-between push cannot deploy, then drop the link.
    try {
      await disableGitAutoDeployments(p.id);
      disabled += 1;
    } catch (err) {
      console.warn(`  disable autodeploy failed for ${p.name}`, err instanceof Error ? err.message : err);
    }
    if (p.link?.type) {
      if (await unlink(p.id)) unlinked += 1;
    }
  }
  console.log(`\napplied: disabled=${disabled} unlinked=${unlinked}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
