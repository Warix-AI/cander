/**
 * GitHub App Octokit factory — Warix org installation.
 * Server-only.
 */

import { App } from "@octokit/app";
import { getGitHubAppConfig, type GitHubAppConfig } from "@/lib/build/config";

export type InstallationOctokit = Awaited<
  ReturnType<App["getInstallationOctokit"]>
>;

let cachedApp: App | null = null;
let cachedKeyFingerprint: string | null = null;

function appFingerprint(config: GitHubAppConfig): string {
  return `${config.appId}:${config.installationId}:${config.privateKey.length}`;
}

export function getGitHubApp(): App | null {
  const config = getGitHubAppConfig();
  if (!config) return null;
  const fp = appFingerprint(config);
  if (!cachedApp || cachedKeyFingerprint !== fp) {
    cachedApp = new App({
      appId: config.appId,
      privateKey: config.privateKey,
    });
    cachedKeyFingerprint = fp;
  }
  return cachedApp;
}

export async function getInstallationOctokit(): Promise<InstallationOctokit | null> {
  const config = getGitHubAppConfig();
  const app = getGitHubApp();
  if (!config || !app) return null;
  return app.getInstallationOctokit(Number(config.installationId));
}
