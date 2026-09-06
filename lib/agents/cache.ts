/**
 * In-memory cache for project agents — avoids a blank wait on reopen.
 */

import type { ProjectAgent, ProjectAgentBundle } from "@/lib/agents/types";

const TTL_MS = 120_000;

type Entry<T> = { at: number; value: T };

const agentsCache = new Map<string, Entry<ProjectAgent[]>>();
const bundleCache = new Map<string, Entry<ProjectAgentBundle>>();
const inflightAgents = new Map<string, Promise<ProjectAgent[]>>();
const inflightBundles = new Map<string, Promise<ProjectAgentBundle>>();

function agentsKey(workspaceId: string, projectId: string) {
  return `${workspaceId}|${projectId}`;
}

function bundleKey(workspaceId: string, projectId: string, agentId: string) {
  return `${workspaceId}|${projectId}|${agentId}`;
}

function fresh<T>(entry: Entry<T> | undefined): T | null {
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) return null;
  return entry.value;
}

export function peekCachedProjectAgents(
  workspaceId: string,
  projectId: string,
): ProjectAgent[] | null {
  return fresh(agentsCache.get(agentsKey(workspaceId, projectId)));
}

export function setCachedProjectAgents(
  workspaceId: string,
  projectId: string,
  agents: ProjectAgent[],
) {
  agentsCache.set(agentsKey(workspaceId, projectId), {
    at: Date.now(),
    value: agents,
  });
}

export function peekCachedAgentBundle(
  workspaceId: string,
  projectId: string,
  agentId: string,
): ProjectAgentBundle | null {
  return fresh(bundleCache.get(bundleKey(workspaceId, projectId, agentId)));
}

export function setCachedAgentBundle(
  workspaceId: string,
  projectId: string,
  agentId: string,
  bundle: ProjectAgentBundle,
) {
  bundleCache.set(bundleKey(workspaceId, projectId, agentId), {
    at: Date.now(),
    value: bundle,
  });
  // Keep list titles in sync when we learn a single agent.
  const listKey = agentsKey(workspaceId, projectId);
  const list = agentsCache.get(listKey);
  if (list) {
    agentsCache.set(listKey, {
      at: Date.now(),
      value: list.value.map((agent) =>
        agent.id === bundle.agent.id ? bundle.agent : agent,
      ),
    });
  }
  emitBundleChange({ workspaceId, projectId, agentId, bundle });
}

export function invalidateCachedAgentBundle(
  workspaceId: string,
  projectId: string,
  agentId: string,
) {
  bundleCache.delete(bundleKey(workspaceId, projectId, agentId));
  emitBundleChange({ workspaceId, projectId, agentId, bundle: null });
}

export function invalidateCachedProjectAgents(
  workspaceId: string,
  projectId: string,
) {
  agentsCache.delete(agentsKey(workspaceId, projectId));
}

type BundleListener = (event: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  bundle: ProjectAgentBundle | null;
}) => void;

const bundleListeners = new Set<BundleListener>();

function emitBundleChange(event: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  bundle: ProjectAgentBundle | null;
}) {
  bundleListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // ignore subscriber errors
    }
  });
}

/** Live-refresh Agent Builder when AI or UI mutates the same bundle. */
export function subscribeAgentBundleCache(listener: BundleListener) {
  bundleListeners.add(listener);
  return () => {
    bundleListeners.delete(listener);
  };
}

export function rememberAgentsInflight(
  workspaceId: string,
  projectId: string,
  promise: Promise<ProjectAgent[]>,
) {
  const key = agentsKey(workspaceId, projectId);
  inflightAgents.set(key, promise);
  void promise.finally(() => {
    if (inflightAgents.get(key) === promise) inflightAgents.delete(key);
  });
}

export function getAgentsInflight(
  workspaceId: string,
  projectId: string,
): Promise<ProjectAgent[]> | null {
  return inflightAgents.get(agentsKey(workspaceId, projectId)) ?? null;
}

export function rememberBundleInflight(
  workspaceId: string,
  projectId: string,
  agentId: string,
  promise: Promise<ProjectAgentBundle>,
) {
  const key = bundleKey(workspaceId, projectId, agentId);
  inflightBundles.set(key, promise);
  void promise.finally(() => {
    if (inflightBundles.get(key) === promise) inflightBundles.delete(key);
  });
}

export function getBundleInflight(
  workspaceId: string,
  projectId: string,
  agentId: string,
): Promise<ProjectAgentBundle> | null {
  return (
    inflightBundles.get(bundleKey(workspaceId, projectId, agentId)) ?? null
  );
}
