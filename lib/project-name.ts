/** Shared project title rules — unique per workspace (case-insensitive). */

export function normalizeProjectTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function projectTitleKey(title: string): string {
  return normalizeProjectTitle(title).toLowerCase();
}

export function isProjectTitleTaken(
  projects: ReadonlyArray<{ id: string; title: string }>,
  title: string,
  exceptId?: string | null,
): boolean {
  const key = projectTitleKey(title);
  if (!key) return false;
  return projects.some(
    (item) =>
      item.id !== exceptId && projectTitleKey(item.title) === key,
  );
}

export function assertUniqueProjectTitle(
  projects: ReadonlyArray<{ id: string; title: string }>,
  title: string,
  exceptId?: string | null,
): string {
  const normalized = normalizeProjectTitle(title);
  if (!normalized) {
    throw new Error("Project name is required.");
  }
  if (isProjectTitleTaken(projects, normalized, exceptId)) {
    throw new Error("A project already uses that name.");
  }
  return normalized;
}
