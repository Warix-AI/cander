import type { Role, Workspace, WorkspaceKind } from "./types";

const CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "mail.com",
  "example.com",
]);

export function workspaceKindOf(workspace: Workspace): WorkspaceKind {
  if (workspace.kind === "personal" || workspace.kind === "business") {
    return workspace.kind;
  }
  return workspace.personal ? "personal" : "business";
}

export function isPersonalWorkspace(workspace: Workspace) {
  return workspaceKindOf(workspace) === "personal";
}

export function isBusinessWorkspace(workspace: Workspace) {
  return workspaceKindOf(workspace) === "business";
}

export function workspaceKindLabel(kind: WorkspaceKind) {
  return kind === "personal" ? "Personal" : "Business";
}

/** Roles available inside a workspace of this kind. */
export function rolesForWorkspaceKind(kind: WorkspaceKind): Role[] {
  if (kind === "personal") return ["Owner", "Member"];
  return ["Owner", "Admin", "Member"];
}

export function emailDomain(email: string) {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return "";
  return email.trim().toLowerCase().slice(at + 1);
}

export function isConsumerEmail(email: string) {
  const domain = emailDomain(email);
  if (!domain) return false;
  return CONSUMER_DOMAINS.has(domain);
}

export function isCompanyEmail(email: string) {
  const domain = emailDomain(email);
  if (!domain) return false;
  return !CONSUMER_DOMAINS.has(domain);
}

/**
 * Business workspaces: company / org email only.
 * Personal workspaces: consumer email only (no company domain).
 */
export function emailFitsWorkspaceKind(kind: WorkspaceKind, email: string) {
  if (kind === "business") return isCompanyEmail(email);
  return isConsumerEmail(email);
}

export function emailWorkspaceMismatchMessage(
  kind: WorkspaceKind,
  email: string,
) {
  if (emailFitsWorkspaceKind(kind, email)) return null;
  if (kind === "business") {
    return `${email} looks like a personal address. Business workspaces need a company email.`;
  }
  return `${email} looks like a company address. Personal workspaces are for personal emails.`;
}
