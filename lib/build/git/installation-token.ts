/**
 * Short-lived GitHub App installation token for sandbox git clone.
 * Server-only — never log or persist the token.
 */

import { getInstallationOctokit } from "@/lib/build/git/github-app";

export async function getGitHubInstallationToken(): Promise<string> {
  const octokit = await getInstallationOctokit();
  if (!octokit) {
    throw new Error("GitHub App is not configured.");
  }
  const auth = (await octokit.auth({ type: "installation" })) as {
    token?: string;
  };
  if (!auth?.token) {
    throw new Error("Could not mint GitHub installation token.");
  }
  return auth.token;
}
