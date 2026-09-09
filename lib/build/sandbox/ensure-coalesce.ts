/**
 * In-process single-flight for ensureProjectSandbox per project.
 * Prevents session thrash when UI + create + poll overlap.
 * Server-only.
 */

import type { EnsureProjectSandboxResult } from "@/lib/build/sandbox/lifecycle";

type Inflight = {
  promise: Promise<EnsureProjectSandboxResult>;
  forceRestart: boolean;
};

const globalKey = "__cander_sandbox_ensure_coalesce__";

function store(): Map<string, Inflight> {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: Map<string, Inflight>;
  };
  if (!g[globalKey]) g[globalKey] = new Map();
  return g[globalKey]!;
}

function key(projectId: string, workspaceId: string): string {
  return `${workspaceId}:${projectId}`;
}

/**
 * Coalesce concurrent ensure calls for the same project.
 * A non-restart waiter joins an in-flight ensure (restart or not).
 * A restart waiter joins only an in-flight restart; otherwise starts its own.
 */
export async function coalesceEnsureProjectSandbox(opts: {
  projectId: string;
  workspaceId: string;
  forceRestart?: boolean;
  run: () => Promise<EnsureProjectSandboxResult>;
}): Promise<EnsureProjectSandboxResult> {
  const k = key(opts.projectId, opts.workspaceId);
  const map = store();
  const wantRestart = Boolean(opts.forceRestart);
  const existing = map.get(k);

  if (existing) {
    if (!wantRestart || existing.forceRestart) {
      return existing.promise;
    }
  }

  let promise!: Promise<EnsureProjectSandboxResult>;
  promise = (async () => {
    try {
      return await opts.run();
    } finally {
      const cur = map.get(k);
      if (cur?.promise === promise) map.delete(k);
    }
  })();

  map.set(k, { promise, forceRestart: wantRestart });
  return promise;
}
