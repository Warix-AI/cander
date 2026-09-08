/**
 * ProjectGitService — create/bind Warix-org repos for Cander projects.
 * Server-only. Callers must already have asserted project access.
 */

import { getGitHubAppConfig } from "@/lib/build/config";
import { getInstallationOctokit } from "@/lib/build/git/github-app";

export const DRAFT_BRANCH = "cander/draft";

export type EnsuredRepo = {
  repoId: number;
  fullName: string;
  defaultBranch: string;
  draftBranch: string;
  draftSha: string;
  created: boolean;
};

function repoNameForProject(projectId: string): string {
  const compact = projectId.replace(/-/g, "").toLowerCase().slice(0, 32);
  return `cander-${compact}`;
}

async function resolveDefaultBranchSha(
  octokit: NonNullable<Awaited<ReturnType<typeof getInstallationOctokit>>>,
  owner: string,
  repo: string,
  defaultBranch: string,
): Promise<string> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const sha = data.object?.sha;
  if (!sha) throw new Error("Could not resolve default branch SHA.");
  return sha;
}

async function ensureDraftBranch(
  octokit: NonNullable<Awaited<ReturnType<typeof getInstallationOctokit>>>,
  owner: string,
  repo: string,
  fromSha: string,
): Promise<{ branch: string; sha: string }> {
  try {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
      {
        owner,
        repo,
        ref: `heads/${DRAFT_BRANCH}`,
      },
    );
    return { branch: DRAFT_BRANCH, sha: data.object.sha };
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 0;
    if (status !== 404) throw err;
  }

  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo,
    ref: `refs/heads/${DRAFT_BRANCH}`,
    sha: fromSha,
  });
  return { branch: DRAFT_BRANCH, sha: fromSha };
}

/**
 * Create (or reuse) a private repo under the Warix GitHub org for this project.
 */
export async function ensureProjectRepository(opts: {
  projectId: string;
  title: string;
  /** Existing binding — skip create if set and still resolvable. */
  existingRepoId?: number | null;
  existingFullName?: string | null;
}): Promise<EnsuredRepo> {
  const config = getGitHubAppConfig();
  const octokit = await getInstallationOctokit();
  if (!config || !octokit) {
    throw new Error("GitHub App is not configured.");
  }

  const org = config.org;

  if (opts.existingFullName || opts.existingRepoId) {
    const fullName =
      opts.existingFullName ??
      (await (async () => {
        const { data } = await octokit.request("GET /repositories/{id}", {
          id: opts.existingRepoId!,
        });
        return data.full_name as string;
      })());
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo) throw new Error(`Invalid repo full name: ${fullName}`);
    const { data: repoData } = await octokit.request(
      "GET /repos/{owner}/{repo}",
      { owner, repo },
    );
    const defaultBranch = repoData.default_branch || "main";
    const baseSha = await resolveDefaultBranchSha(
      octokit,
      owner,
      repo,
      defaultBranch,
    );
    const draft = await ensureDraftBranch(octokit, owner, repo, baseSha);
    return {
      repoId: Number(repoData.id),
      fullName: repoData.full_name,
      defaultBranch,
      draftBranch: draft.branch,
      draftSha: draft.sha,
      created: false,
    };
  }

  const name = repoNameForProject(opts.projectId);
  let created = false;
  let repoData: {
    id: number;
    full_name: string;
    default_branch: string;
  };

  try {
    if (config.templateRepo) {
      const [templateOwner, templateRepo] = config.templateRepo.split("/");
      if (!templateOwner || !templateRepo) {
        throw new Error("GITHUB_APP_TEMPLATE_REPO must be owner/name");
      }
      const { data } = await octokit.request(
        "POST /repos/{template_owner}/{template_repo}/generate",
        {
          template_owner: templateOwner,
          template_repo: templateRepo,
          owner: org,
          name,
          private: true,
          include_all_branches: false,
          description: `Cander project: ${opts.title}`.slice(0, 350),
        },
      );
      repoData = {
        id: Number(data.id),
        full_name: data.full_name,
        default_branch: data.default_branch || "main",
      };
      created = true;
    } else {
      const { data } = await octokit.request("POST /orgs/{org}/repos", {
        org,
        name,
        private: true,
        auto_init: true,
        description: `Cander project: ${opts.title}`.slice(0, 350),
        has_issues: false,
        has_projects: false,
        has_wiki: false,
      });
      repoData = {
        id: Number(data.id),
        full_name: data.full_name,
        default_branch: data.default_branch || "main",
      };
      created = true;
    }
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 0;
    // Name collision — fetch existing
    if (status === 422) {
      const { data } = await octokit.request("GET /repos/{owner}/{repo}", {
        owner: org,
        repo: name,
      });
      repoData = {
        id: Number(data.id),
        full_name: data.full_name,
        default_branch: data.default_branch || "main",
      };
      created = false;
    } else {
      throw err;
    }
  }

  const [owner, repo] = repoData.full_name.split("/");
  // Template generate can lag before refs exist — brief retry
  let baseSha: string | null = null;
  for (let i = 0; i < 5; i++) {
    try {
      baseSha = await resolveDefaultBranchSha(
        octokit,
        owner,
        repo,
        repoData.default_branch,
      );
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  if (!baseSha) {
    throw new Error("Repository created but default branch not ready yet.");
  }

  const draft = await ensureDraftBranch(octokit, owner, repo, baseSha);
  return {
    repoId: repoData.id,
    fullName: repoData.full_name,
    defaultBranch: repoData.default_branch,
    draftBranch: draft.branch,
    draftSha: draft.sha,
    created,
  };
}
