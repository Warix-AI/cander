/**
 * Server-only build infra credentials (Warix org).
 * Never import from client components. Never expose these values.
 */

function trim(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Normalize PEM private keys stored with literal \n in env. */
export function normalizePemKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("-----BEGIN")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    if (decoded.includes("-----BEGIN")) return decoded;
  } catch {
    /* fall through */
  }
  return trimmed.replace(/\\n/g, "\n");
}

export type GitHubAppConfig = {
  appId: string;
  privateKey: string;
  installationId: string;
  org: string;
  /** Optional template repo full name `org/name` to generate from. */
  templateRepo: string | null;
};

export function getGitHubAppConfig(): GitHubAppConfig | null {
  const appId = trim(process.env.GITHUB_APP_ID);
  const privateKeyRaw = trim(process.env.GITHUB_APP_PRIVATE_KEY);
  const installationId = trim(process.env.GITHUB_APP_INSTALLATION_ID);
  const org =
    trim(process.env.GITHUB_APP_ORG) ??
    trim(process.env.CANDER_GITHUB_ORG) ??
    "Warix-AI";
  if (!appId || !privateKeyRaw || !installationId) return null;
  return {
    appId,
    privateKey: normalizePemKey(privateKeyRaw),
    installationId,
    org,
    templateRepo: trim(process.env.GITHUB_APP_TEMPLATE_REPO),
  };
}

export function isGitHubAppConfigured(): boolean {
  return getGitHubAppConfig() !== null;
}

export type VercelTeamConfig = {
  token: string | null;
  teamId: string | null;
  /** Hosted Cander project id — not per-tenant app projects. */
  platformProjectId: string | null;
};

/** Vercel team credentials for Sandbox + future Deployments API. */
export function getVercelTeamConfig(): VercelTeamConfig {
  return {
    token: trim(process.env.VERCEL_TOKEN),
    teamId: trim(process.env.VERCEL_TEAM_ID),
    platformProjectId: trim(process.env.VERCEL_PROJECT_ID),
  };
}

export function isVercelTeamConfigured(): boolean {
  const c = getVercelTeamConfig();
  // On Vercel, OIDC may replace token for sandbox; team id still useful for Deploy API.
  return Boolean(c.token || process.env.VERCEL === "1");
}

export type SupabaseManagementConfig = {
  accessToken: string;
  orgId: string;
};

export function getSupabaseManagementConfig(): SupabaseManagementConfig | null {
  const accessToken =
    trim(process.env.SUPABASE_MANAGEMENT_ACCESS_TOKEN) ??
    trim(process.env.SUPABASE_ACCESS_TOKEN);
  // Management create uses organization_slug; accept slug or id as the org handle.
  const orgId =
    trim(process.env.SUPABASE_MANAGEMENT_ORG_SLUG) ??
    trim(process.env.SUPABASE_MANAGEMENT_ORG_ID) ??
    trim(process.env.SUPABASE_ORG_ID);
  if (!accessToken || !orgId) return null;
  return { accessToken, orgId };
}

export function isSupabaseManagementConfigured(): boolean {
  return getSupabaseManagementConfig() !== null;
}

export type BuildInfraCapability = {
  github: boolean;
  vercel: boolean;
  supabaseManagement: boolean;
};

export function getBuildInfraCapabilities(): BuildInfraCapability {
  return {
    github: isGitHubAppConfigured(),
    vercel: isVercelTeamConfigured(),
    supabaseManagement: isSupabaseManagementConfigured(),
  };
}
