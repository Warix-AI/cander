/**
 * Client helpers for Project Agent Builder APIs.
 */

import { getRawOpenAIAuthHeaders } from "@/lib/ai/raw-openai/upload-client";
import {
  getAgentsInflight,
  getBundleInflight,
  peekCachedAgentBundle,
  peekCachedProjectAgents,
  rememberAgentsInflight,
  rememberBundleInflight,
  setCachedAgentBundle,
  setCachedProjectAgents,
  invalidateCachedProjectAgents,
} from "@/lib/agents/cache";
import type {
  AgentConfigPatch,
  AgentConfigProposal,
  AgentConversationMessage,
  AgentRun,
  ProjectAgent,
  ProjectAgentBundle,
} from "@/lib/agents/types";

async function authHeaders(): Promise<HeadersInit> {
  return getRawOpenAIAuthHeaders();
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Request failed (${res.status}).`,
    );
  }
  return data;
}

export async function listProjectAgentsClient(opts: {
  workspaceId: string;
  projectId: string;
  force?: boolean;
}): Promise<ProjectAgent[]> {
  const data = await listProjectAgentsWithStatsClient(opts);
  return data.agents;
}

export async function listProjectAgentsWithStatsClient(opts: {
  workspaceId: string;
  projectId: string;
  force?: boolean;
}): Promise<{ agents: ProjectAgent[]; runsLast7d: number }> {
  if (!opts.force) {
    const cached = peekCachedProjectAgents(opts.workspaceId, opts.projectId);
    if (cached) {
      return { agents: cached, runsLast7d: 0 };
    }
    const inflight = getAgentsInflight(opts.workspaceId, opts.projectId);
    if (inflight) {
      const agents = await inflight;
      return { agents, runsLast7d: 0 };
    }
  }

  const promise = (async () => {
    const headers = await authHeaders();
    const params = new URLSearchParams({
      workspaceId: opts.workspaceId,
    });
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/agents?${params}`,
      { headers },
    );
    const data = await parseJson<{
      agents: ProjectAgent[];
      runsLast7d?: number;
    }>(res);
    const agents = data.agents ?? [];
    setCachedProjectAgents(opts.workspaceId, opts.projectId, agents);
    return { agents, runsLast7d: data.runsLast7d ?? 0 };
  })();

  rememberAgentsInflight(
    opts.workspaceId,
    opts.projectId,
    promise.then((d) => d.agents),
  );
  return promise;
}

export async function createProjectAgentClient(opts: {
  workspaceId: string;
  projectId: string;
  name?: string;
  description?: string;
  instructions?: string;
}): Promise<ProjectAgent> {
  const headers = await authHeaders();
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/agents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(opts),
    },
  );
  const data = await parseJson<{ agent: ProjectAgent }>(res);
  const cached = peekCachedProjectAgents(opts.workspaceId, opts.projectId) ?? [];
  setCachedProjectAgents(opts.workspaceId, opts.projectId, [
    ...cached.filter((agent) => agent.id !== data.agent.id),
    data.agent,
  ]);
  return data.agent;
}

export async function loadAgentBundleClient(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  force?: boolean;
}): Promise<ProjectAgentBundle> {
  if (!opts.force) {
    const cached = peekCachedAgentBundle(
      opts.workspaceId,
      opts.projectId,
      opts.agentId,
    );
    if (cached) return cached;
    const inflight = getBundleInflight(
      opts.workspaceId,
      opts.projectId,
      opts.agentId,
    );
    if (inflight) return inflight;
  }

  const promise = (async () => {
    const headers = await authHeaders();
    const params = new URLSearchParams({ workspaceId: opts.workspaceId });
    const res = await fetch(
      `/api/projects/${encodeURIComponent(opts.projectId)}/agents/${encodeURIComponent(opts.agentId)}?${params}`,
      { headers },
    );
    const bundle = await parseJson<ProjectAgentBundle>(res);
    setCachedAgentBundle(
      opts.workspaceId,
      opts.projectId,
      opts.agentId,
      bundle,
    );
    return bundle;
  })();

  rememberBundleInflight(
    opts.workspaceId,
    opts.projectId,
    opts.agentId,
    promise,
  );
  return promise;
}

export async function updateProjectAgentClient(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  patch: Partial<{
    name: string;
    description: string;
    instructions: string;
    enabled: boolean;
    status: import("@/lib/agents/types").AgentStatus;
  }>;
}): Promise<ProjectAgent> {
  const headers = await authHeaders();
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/agents/${encodeURIComponent(opts.agentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ workspaceId: opts.workspaceId, ...opts.patch }),
    },
  );
  const data = await parseJson<{ agent: ProjectAgent }>(res);
  const list =
    peekCachedProjectAgents(opts.workspaceId, opts.projectId)?.map((agent) =>
      agent.id === data.agent.id ? data.agent : agent,
    ) ?? [data.agent];
  setCachedProjectAgents(opts.workspaceId, opts.projectId, list);
  const cached = peekCachedAgentBundle(
    opts.workspaceId,
    opts.projectId,
    opts.agentId,
  );
  if (cached) {
    setCachedAgentBundle(opts.workspaceId, opts.projectId, opts.agentId, {
      ...cached,
      agent: data.agent,
    });
  }
  return data.agent;
}

export async function deleteProjectAgentClient(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
}): Promise<void> {
  const headers = await authHeaders();
  const params = new URLSearchParams({ workspaceId: opts.workspaceId });
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/agents/${encodeURIComponent(opts.agentId)}?${params}`,
    { method: "DELETE", headers },
  );
  await parseJson<{ ok: boolean }>(res);
  invalidateCachedProjectAgents(opts.workspaceId, opts.projectId);
}

export async function duplicateProjectAgentClient(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
}): Promise<ProjectAgentBundle> {
  const headers = await authHeaders();
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/agents/${encodeURIComponent(opts.agentId)}/duplicate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ workspaceId: opts.workspaceId }),
    },
  );
  const bundle = await parseJson<ProjectAgentBundle>(res);
  invalidateCachedProjectAgents(opts.workspaceId, opts.projectId);
  setCachedAgentBundle(
    opts.workspaceId,
    opts.projectId,
    bundle.agent.id,
    bundle,
  );
  return bundle;
}

export async function applyAgentConfigPatchClient(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  patch: AgentConfigPatch;
  confirmed?: boolean;
}): Promise<ProjectAgentBundle> {
  const headers = await authHeaders();
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/agents/${encodeURIComponent(opts.agentId)}/config`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        workspaceId: opts.workspaceId,
        patch: opts.patch,
        confirmed: opts.confirmed,
      }),
    },
  );
  const bundle = await parseJson<ProjectAgentBundle>(res);
  setCachedAgentBundle(
    opts.workspaceId,
    opts.projectId,
    opts.agentId,
    bundle,
  );
  return bundle;
}

export async function proposeAgentConfigClient(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  message: string;
}): Promise<AgentConfigProposal> {
  const headers = await authHeaders();
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/agents/${encodeURIComponent(opts.agentId)}/propose-config`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        workspaceId: opts.workspaceId,
        message: opts.message,
      }),
    },
  );
  return parseJson<AgentConfigProposal>(res);
}

export async function runAgentClient(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  message?: string;
}): Promise<{
  run: AgentRun;
  content: string;
  toolCount: number;
}> {
  const headers = await authHeaders();
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/agents/${encodeURIComponent(opts.agentId)}/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        workspaceId: opts.workspaceId,
        message: opts.message,
      }),
    },
  );
  return parseJson(res);
}

export async function fetchAgentConversationClient(opts: {
  workspaceId: string;
  projectId: string;
  agentId: string;
}): Promise<{
  agent: ProjectAgent;
  messages: AgentConversationMessage[];
  runs: AgentRun[];
}> {
  const headers = await authHeaders();
  const params = new URLSearchParams({ workspaceId: opts.workspaceId });
  const res = await fetch(
    `/api/projects/${encodeURIComponent(opts.projectId)}/agents/${encodeURIComponent(opts.agentId)}/activity?${params}`,
    { headers },
  );
  const data = await parseJson<{
    runs?: AgentRun[];
    messages?: AgentConversationMessage[];
    agent?: ProjectAgent;
  }>(res);
  const bundle = await loadAgentBundleClient({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    agentId: opts.agentId,
    force: true,
  });
  return {
    agent: data.agent ?? bundle.agent,
    messages: data.messages ?? bundle.messages ?? [],
    runs: data.runs ?? bundle.runs ?? [],
  };
}
