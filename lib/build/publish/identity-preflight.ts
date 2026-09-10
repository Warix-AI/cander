/**
 * Phase 5 — Build identity contract (Warix-only).
 * Pure helpers for publish preflight + commit author lock.
 */

export const WEAK_BUILD_GIT_AUTHOR_EMAIL =
  "41898282+github-actions[bot]@users.noreply.github.com";

export function normalizeIdentityEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

export function normalizeIdentityName(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export type TipCommitIdentity = {
  authorName: string | null;
  authorEmail: string | null;
  committerName: string | null;
  committerEmail: string | null;
};

export type ExpectedBuildAuthor = {
  name: string;
  email: string;
};

/**
 * Tip author/committer must match the configured Build author email.
 * Name mismatch alone is a warning-style issue only when email matches.
 */
export function tipCommitIdentityIssues(
  tip: TipCommitIdentity,
  expected: ExpectedBuildAuthor,
): string[] {
  const issues: string[] = [];
  const expectedEmail = normalizeIdentityEmail(expected.email);
  if (!expectedEmail) {
    issues.push(
      "Build git author email is not configured (set CANDER_BUILD_GIT_AUTHOR_EMAIL).",
    );
    return issues;
  }

  if (expectedEmail === WEAK_BUILD_GIT_AUTHOR_EMAIL) {
    issues.push(
      "Build git author is the github-actions bot default — set CANDER_BUILD_GIT_AUTHOR_NAME and CANDER_BUILD_GIT_AUTHOR_EMAIL to a GitHub identity that belongs to the Warix Vercel team, or Publish will be Blocked.",
    );
  }

  const authorEmail = normalizeIdentityEmail(tip.authorEmail);
  const committerEmail = normalizeIdentityEmail(tip.committerEmail);
  const tipEmails = [authorEmail, committerEmail].filter(Boolean);

  if (tipEmails.length === 0) {
    issues.push(
      "Draft tip commit has no author/committer email — cannot verify Warix Build identity.",
    );
    return issues;
  }

  const emailOk = tipEmails.every((e) => e === expectedEmail);
  if (!emailOk) {
    issues.push(
      `Draft tip commit author must be the Warix Build identity (${expected.email}). Tip has author=${tip.authorEmail || "?"} committer=${tip.committerEmail || "?"}. Re-save the draft after configuring CANDER_BUILD_GIT_AUTHOR_*, or ask Cander to repair the tip.`,
    );
  }

  return issues;
}

/** Platform identity: never customer GitHub/Vercel tokens for Build. */
export function buildIdentityConfigIssues(opts: {
  githubAppConfigured: boolean;
  githubOrg: string | null;
  vercelTokenConfigured: boolean;
  vercelTeamIdConfigured: boolean;
}): string[] {
  const issues: string[] = [];
  if (!opts.githubAppConfigured) {
    issues.push(
      "GitHub App is not configured — Build must use the Warix-AI installation, never a customer GitHub token.",
    );
  }
  const org = (opts.githubOrg || "").trim().toLowerCase();
  if (org && org !== "warix-ai") {
    issues.push(
      `GitHub App org is "${opts.githubOrg}" — expected Warix-AI for Build identity.`,
    );
  }
  if (!opts.vercelTokenConfigured) {
    issues.push(
      "VERCEL_TOKEN is not configured — Publish must use the Warix team token, never a customer Vercel account.",
    );
  }
  if (!opts.vercelTeamIdConfigured) {
    issues.push(
      "VERCEL_TEAM_ID is not configured — Deploy API must target the Warix team.",
    );
  }
  return issues;
}
