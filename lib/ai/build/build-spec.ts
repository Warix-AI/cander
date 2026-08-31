/**
 * BuildSpec constructors, path get/set, delta apply, versioning.
 * Pure — no I/O.
 */

import type {
  BuildPage,
  BuildSpec,
  BuildSpecDelta,
  BuildSpecPath,
  BuildProjectType,
} from "./types.ts";

function nowIso(): string {
  return new Date().toISOString();
}

export function emptyBuildSpec(opts: {
  projectId: string;
  projectType?: BuildProjectType;
  goal?: string;
}): BuildSpec {
  const t = nowIso();
  return {
    projectId: opts.projectId,
    projectType: opts.projectType ?? "unknown",
    goal: opts.goal ?? "",
    requirements: [],
    constraints: [],
    design: {},
    pages: [],
    sections: [],
    components: [],
    integrations: [],
    automations: [],
    files: [],
    dependencies: [],
    customRequirements: [],
    buildSpecVersion: 1,
    parentVersion: null,
    createdAt: t,
    updatedAt: t,
  };
}

export function cloneBuildSpec(spec: BuildSpec): BuildSpec {
  return structuredClone(spec);
}

/** Dot-path get. Supports numeric indices for arrays. */
export function getAtPath(root: unknown, path: BuildSpecPath): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    const key = /^\d+$/.test(p) ? Number(p) : p;
    cur = (cur as Record<string | number, unknown>)[key as string];
  }
  return cur;
}

export function setAtPath(
  root: Record<string, unknown>,
  path: BuildSpecPath,
  value: unknown,
): void {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const key = /^\d+$/.test(p) ? Number(p) : p;
    const next = cur[key as string];
    if (next == null || typeof next !== "object") {
      const nxtPart = parts[i + 1]!;
      const nest: unknown = /^\d+$/.test(nxtPart) ? [] : {};
      cur[key as string] = nest;
    }
    cur = cur[key as string] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]!;
  const lastKey = /^\d+$/.test(last) ? Number(last) : last;
  cur[lastKey as string] = value;
}

function removeAtPath(root: Record<string, unknown>, path: BuildSpecPath): void {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const key = /^\d+$/.test(p) ? Number(p) : p;
    const next = cur[key as string];
    if (next == null || typeof next !== "object") return;
    cur = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]!;
  if (/^\d+$/.test(last) && Array.isArray(cur)) {
    cur.splice(Number(last), 1);
    return;
  }
  delete cur[last];
}

/**
 * Apply a delta to a clone. Does NOT bump version — use commitBuildSpecDelta.
 */
export function applyBuildSpecDelta(
  spec: BuildSpec,
  delta: BuildSpecDelta,
): BuildSpec {
  const next = cloneBuildSpec(spec) as unknown as Record<string, unknown>;

  for (const op of delta.set ?? []) {
    setAtPath(next, op.path, op.value);
  }
  for (const op of delta.remove ?? []) {
    removeAtPath(next, op.path);
  }
  for (const op of delta.append ?? []) {
    const existing = getAtPath(next, op.path);
    if (Array.isArray(existing)) {
      existing.push(op.value);
    } else if (existing == null) {
      setAtPath(next, op.path, [op.value]);
    } else {
      throw new Error(`append target is not an array: ${op.path}`);
    }
  }
  for (const op of delta.replace ?? []) {
    const existing = getAtPath(next, op.path);
    if (op.from !== undefined && existing !== op.from) {
      throw new Error(`replace mismatch at ${op.path}`);
    }
    setAtPath(next, op.path, op.to);
  }

  return next as unknown as BuildSpec;
}

/** Commit validated delta: apply + version bump. */
export function commitBuildSpecDelta(
  spec: BuildSpec,
  delta: BuildSpecDelta,
  opts?: { at?: string },
): BuildSpec {
  const applied = applyBuildSpecDelta(spec, delta);
  const at = opts?.at ?? nowIso();
  return {
    ...applied,
    projectId: spec.projectId,
    parentVersion: spec.buildSpecVersion,
    buildSpecVersion: spec.buildSpecVersion + 1,
    createdAt: spec.createdAt,
    updatedAt: at,
  };
}

export function validateBuildSpecDelta(
  spec: BuildSpec,
  delta: BuildSpecDelta,
): { ok: true } | { ok: false; error: string } {
  try {
    applyBuildSpecDelta(spec, delta);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Compact slice for FM context — never the full blob. */
export function compileBuildSpecSlice(
  spec: BuildSpec,
  opts?: { focusRoutes?: string[]; maxPages?: number },
): string {
  const maxPages = opts?.maxPages ?? 8;
  const focus = opts?.focusRoutes?.length
    ? spec.pages.filter((p) => opts.focusRoutes!.includes(p.route))
    : spec.pages.slice(0, maxPages);
  const pages =
    focus.length > 0
      ? focus
      : (spec.pages.slice(0, maxPages) as BuildPage[]);

  const lines = [
    `BuildSpec v${spec.buildSpecVersion} project=${spec.projectId}`,
    `type=${spec.projectType} goal=${truncate(spec.goal, 120)}`,
  ];
  if (spec.recipeId) {
    lines.push(`recipe=${spec.recipeId}@${spec.recipeVersion ?? 0}`);
  }
  if (spec.design.theme || spec.design.style) {
    lines.push(
      `design theme=${spec.design.theme ?? "-"} style=${spec.design.style ?? "-"}`,
    );
  }
  if (pages.length) {
    lines.push(
      `pages: ${pages.map((p) => `${p.route}(${p.title})`).join(", ")}`,
    );
  }
  if (spec.components.length) {
    const comps = spec.components.slice(0, 6);
    lines.push(
      `components: ${comps.map((c) => `${c.role}:${c.id}`).join(", ")}`,
    );
  }
  if (spec.requirements.length) {
    lines.push(`requirements: ${spec.requirements.slice(0, 4).join("; ")}`);
  }
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

export function findPageByRoute(
  spec: BuildSpec,
  route: string,
): BuildPage | undefined {
  const norm = route.startsWith("/") ? route : `/${route}`;
  return spec.pages.find((p) => p.route === norm || p.route === route);
}
