/**
 * Phase 4 edit-path allowlist guards (pure — safe for node:test).
 */

export const EDIT_FILE_TOOLS = [
  "computer.files.read",
  "computer.files.write",
  "computer.files.patch",
  "computer.files.list",
] as const;

/** Mid-loop persist and publish are banned on the edit path. */
export const EDIT_BLOCKED_TOOLS = [
  "build.publish",
  "computer.files.persist",
] as const;

export function editToolNamesFromBuildDomain(
  buildDomainTools: readonly string[],
): string[] {
  return [
    ...buildDomainTools.filter((n) => n !== "build.publish"),
    ...EDIT_FILE_TOOLS,
  ];
}

export function editPathAllowsPublish(toolNames: string[]): boolean {
  return toolNames.includes("build.publish");
}

export function editPathAllowsMidLoopPersist(toolNames: string[]): boolean {
  return toolNames.includes("computer.files.persist");
}
