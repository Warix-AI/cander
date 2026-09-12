/**
 * Connector sync → Expert project events.
 * Detects genuinely new mail rows and wakes Cander to route inside the project.
 * No AI in sync itself — only after a new message is confirmed.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listExpertDirectory } from "@/lib/agents/directory";
import { routeEventToExpert } from "@/lib/agents/routing";
import type { SyncMessageHeader } from "@/lib/connectors/sdk/types";
import {
  formatMailSituation,
  gmailEventIdempotencyKey,
} from "@/lib/agents/connector-event-format";

export {
  formatMailSituation,
  gmailEventIdempotencyKey,
} from "@/lib/agents/connector-event-format";

export type ConnectorMailEvent = {
  workspaceId: string;
  profileId: string;
  connectionId: string;
  connectorId: string;
  message: SyncMessageHeader;
};

/**
 * Resolve which Expert projects should see events for this connection.
 * Prefer agent_connector_scopes; fall back to projects whose Experts have
 * empty scope (all connectors) — never fan out to every workspace Expert.
 */
export async function resolveProjectsForConnection(opts: {
  workspaceId: string;
  connectionId: string;
}): Promise<string[]> {
  const admin = createSupabaseAdminClient();

  const { data: scoped } = await admin
    .from("agent_connector_scopes")
    .select("project_id, agent_id")
    .eq("workspace_id", opts.workspaceId)
    .eq("connection_id", opts.connectionId)
    .eq("enabled", true);

  const scopedProjects = [
    ...new Set(
      (scoped ?? [])
        .map((row) => String(row.project_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (scopedProjects.length) return scopedProjects;

  // Empty-scope Experts: active agents with no rows in agent_connector_scopes.
  const { data: agents } = await admin
    .from("project_agents")
    .select("id, project_id")
    .eq("workspace_id", opts.workspaceId)
    .eq("status", "active")
    .eq("enabled", true);

  if (!agents?.length) return [];

  const agentIds = agents.map((a) => String(a.id));
  const { data: anyScopes } = await admin
    .from("agent_connector_scopes")
    .select("agent_id")
    .eq("workspace_id", opts.workspaceId)
    .in("agent_id", agentIds);

  const scopedAgentIds = new Set(
    (anyScopes ?? []).map((row) => String(row.agent_id)),
  );

  const openProjects = [
    ...new Set(
      agents
        .filter((a) => !scopedAgentIds.has(String(a.id)))
        .map((a) => String(a.project_id))
        .filter(Boolean),
    ),
  ];

  // If open-scope Experts span many projects, refuse workspace-wide fan-out.
  if (openProjects.length > 3) return [];
  return openProjects;
}

export type DispatchMailEventResult = {
  providerMessageId: string;
  projectId: string;
  consulted: boolean;
  expertId?: string;
  expertName?: string;
  reason: string;
  runId?: string;
};

/**
 * For each new mail header, route inside each associated Expert project.
 */
export async function dispatchNewMailToExperts(
  opts: ConnectorMailEvent,
): Promise<DispatchMailEventResult[]> {
  const projects = await resolveProjectsForConnection({
    workspaceId: opts.workspaceId,
    connectionId: opts.connectionId,
  });
  if (!projects.length) {
    return [
      {
        providerMessageId: opts.message.providerMessageId,
        projectId: "",
        consulted: false,
        reason: "No Expert project associated with this connection.",
      },
    ];
  }

  const results: DispatchMailEventResult[] = [];
  const idempotencyKey = gmailEventIdempotencyKey(
    opts.connectionId,
    opts.message.providerMessageId,
  );

  for (const projectId of projects) {
    const directory = await listExpertDirectory({
      workspaceId: opts.workspaceId,
      projectId,
      includeDraft: false,
    });
    if (!directory.length) {
      results.push({
        providerMessageId: opts.message.providerMessageId,
        projectId,
        consulted: false,
        reason: "Project has no active Experts.",
      });
      continue;
    }

    // Pre-select name for a natural Cander opening once routing succeeds.
    // routeEventToExpert selects again (same directory) with idempotency.
    const baseSituation = formatMailSituation({ message: opts.message });

    const routed = await routeEventToExpert({
      workspaceId: opts.workspaceId,
      profileId: opts.profileId,
      projectId,
      connectionId: opts.connectionId,
      situation: baseSituation,
      idempotencyKey: `${idempotencyKey}:project:${projectId}`,
      triggerPayload: {
        connectorId: opts.connectorId,
        providerMessageId: opts.message.providerMessageId,
        threadId: opts.message.threadId ?? null,
        fromAddr: opts.message.fromAddr ?? null,
        subject: opts.message.subject ?? null,
        receivedAt: opts.message.receivedAt ?? null,
      },
      formatSituationForExpert: (expertName) =>
        formatMailSituation({
          expertName,
          message: opts.message,
        }),
    });

    if (!routed.consulted) {
      results.push({
        providerMessageId: opts.message.providerMessageId,
        projectId,
        consulted: false,
        reason: routed.reason,
      });
      continue;
    }

    results.push({
      providerMessageId: opts.message.providerMessageId,
      projectId,
      consulted: true,
      expertId: routed.expert.id,
      expertName: routed.expert.name,
      reason: routed.reason,
      runId: routed.result.run.id,
    });
  }

  return results;
}
