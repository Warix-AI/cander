/**
 * Parse `git status --porcelain` into write vs delete paths.
 * Pure — safe for unit tests without sandbox providers.
 */

const SKIP_PREFIXES = [
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  ".git/",
  ".turbo/",
  "coverage/",
  ".cache/",
  ".codex/",
  ".config/",
  ".global/",
  ".local/",
  ".npm/",
  ".vercel/",
];

const SKIP_NAMES = new Set([
  ".npmrc",
  ".sudo_as_admin_successful",
  ".DS_Store",
  "package-lock.json",
]);

export function shouldSkipPersistPath(path: string): boolean {
  const base = path.split("/").pop() || path;
  if (SKIP_NAMES.has(base) || SKIP_NAMES.has(path)) return true;
  if (path === "node_modules" || path === ".next" || path === ".codex") return true;
  return SKIP_PREFIXES.some(
    (p) => path === p.slice(0, -1) || path.startsWith(p) || path === p.replace(/\/$/, ""),
  );
}

function shouldSkipPath(path: string): boolean {
  return shouldSkipPersistPath(path);
}

export type PorcelainChange = {
  writes: string[];
  deletes: string[];
};

/**
 * Renames contribute the new path as a write and the old path as a delete.
 */
export function parsePorcelainChanges(stdout: string): PorcelainChange {
  const writes: string[] = [];
  const deletes: string[] = [];
  for (const line of stdout.split("\n")) {
    if (line.length < 3) continue;
    const xy = line.slice(0, 2);
    const rest = line.slice(3).trim();
    if (!rest) continue;
    const isRename = rest.includes(" -> ");
    const left = isRename ? rest.split(" -> ")[0]!.trim() : rest;
    const right = isRename
      ? rest.split(" -> ").pop()!.trim().replace(/^"+|"+$/g, "")
      : rest.replace(/^"+|"+$/g, "");

    if (isRename) {
      const oldPath = left.replace(/^"+|"+$/g, "");
      if (oldPath && !shouldSkipPath(oldPath)) deletes.push(oldPath);
      if (right && !shouldSkipPath(right)) writes.push(right);
      continue;
    }

    const path = right;
    if (!path || shouldSkipPath(path)) continue;
    const staged = xy[0] || " ";
    const unstaged = xy[1] || " ";
    if (staged === "D" || unstaged === "D") {
      deletes.push(path);
      continue;
    }
    writes.push(path);
  }
  return {
    writes: [...new Set(writes)],
    deletes: [...new Set(deletes)].filter((p) => !writes.includes(p)),
  };
}
