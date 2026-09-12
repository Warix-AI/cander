/**
 * Connector sync → Expert project events.
 * Detects genuinely new mail rows and wakes Cander to route inside the project.
 * No AI in sync itself — only after a new message is confirmed.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listExpertDirectory } from "@/lib/agents/directory";
import { routeEventToExpert } from "@/lib/agents/routing";
import type { SyncMessageHeader } from "@/lib/connectors/sdk/types";
import { ensureMailBodyCached } from "@/lib/connectors/sdk/operations";
import {
  formatMailSituation,
  gmailEventIdempotencyKey,
  type MailSituationHeader,
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

const MAX_THREAD_MESSAGES = 12;

function rowToMailHeader(row: {
  provider_message_id?: string | null;
  from_addr?: string | null;
  to_addrs?: unknown;
  subject?: string | null;
  snippet?: string | null;
  body_text?: string | null;
  received_at?: string | null;
  thread_id?: string | null;
}): MailSituationHeader | null {
  const providerMessageId = String(row.provider_message_id ?? "").trim();
  if (!providerMessageId) return null;
  const toAddrs = Array.isArray(row.to_addrs)
    ? row.to_addrs.map((a) => String(a)).filter(Boolean)
    : [];
  return {
    providerMessageId,
    fromAddr: row.from_addr ?? null,
    toAddrs,
    subject: row.subject ?? null,
    snippet: row.snippet ?? null,
    bodyText: row.body_text ?? null,
    receivedAt: row.received_at ?? null,
    threadId: row.thread_id ?? null,
  };
}

/**
 * Load prior messages in the same Gmail thread (oldest → newest) and
 * best-effort cache bodies so the Expert sees the full conversation.
 */
async function loadMailThreadForSituation(opts: {
  workspaceId: string;
  profileId: string;
  connectionId: string;
  connectorId: string;
  latest: MailSituationHeader;
}): Promise<MailSituationHeader[]> {
  const threadId = opts.latest.threadId?.trim();
  if (!threadId) return [opts.latest];

  const admin = createSupabaseAdminClient();
  const { data: rows } = await admin
    .from("connector_mail_messages")
    .select(
      "provider_message_id, from_addr, to_addrs, subject, snippet, body_text, received_at, thread_id",
    )
    .eq("connection_id", opts.connectionId)
    .eq("thread_id", threadId)
    .order("received_at", { ascending: true, nullsFirst: false })
    .limit(MAX_THREAD_MESSAGES);

  const fromDb = (rows ?? [])
    .map((row) => rowToMailHeader(row))
    .filter((m): m is MailSituationHeader => Boolean(m));

  // Ensure the triggering message is present even if the select raced.
  const byId = new Map(fromDb.map((m) => [m.providerMessageId, m]));
  if (!byId.has(opts.latest.providerMessageId)) {
    byId.set(opts.latest.providerMessageId, opts.latest);
  } else {
    // Prefer the freshly loaded latest body/snippet.
    byId.set(opts.latest.providerMessageId, {
      ...byId.get(opts.latest.providerMessageId)!,
      ...opts.latest,
      bodyText:
        opts.latest.bodyText ||
        byId.get(opts.latest.providerMessageId)?.bodyText ||
        null,
    });
  }

  const ordered = [...byId.values()].sort((a, b) => {
    const ta = a.receivedAt ? Date.parse(a.receivedAt) : 0;
    const tb = b.receivedAt ? Date.parse(b.receivedAt) : 0;
    return ta - tb;
  });

  // If local sync only has the latest message, pull the rest of the thread from Gmail.
  if (ordered.length < 2) {
    try {
      const { executeConnectorTool } = await import(
        "@/lib/connectors/executor"
      );
      const searched = await executeConnectorTool({
        client: admin,
        workspaceId: opts.workspaceId,
        profileId: opts.profileId,
        tool: "gmail.search",
        arguments: { query: `thread:${threadId}`, maxResults: 25 },
        connectionId: opts.connectionId,
      });
      if (searched.ok) {
        const parsed = JSON.parse(searched.output) as {
          messages?: Array<Record<string, unknown>>;
        };
        for (const row of parsed.messages ?? []) {
          const id = String(row.id ?? "").trim();
          if (!id) continue;
          const from =
            typeof row.from === "string"
              ? row.from
              : typeof row.fromAddr === "string"
                ? row.fromAddr
                : null;
          const toRaw = row.to;
          const toAddrs = Array.isArray(toRaw)
            ? toRaw.map((t) => String(t)).filter(Boolean)
            : typeof toRaw === "string" && toRaw.trim()
              ? [toRaw.trim()]
              : [];
          const header: MailSituationHeader = {
            providerMessageId: id,
            fromAddr: from,
            toAddrs,
            subject:
              typeof row.subject === "string" ? row.subject : null,
            snippet:
              typeof row.snippet === "string" ? row.snippet : null,
            bodyText:
              typeof row.body === "string" ? row.body : null,
            receivedAt:
              typeof row.date === "string"
                ? row.date
                : typeof row.receivedAt === "string"
                  ? row.receivedAt
                  : null,
            threadId,
          };
          const existing = byId.get(id);
          byId.set(
            id,
            existing
              ? {
                  ...existing,
                  ...header,
                  bodyText: header.bodyText || existing.bodyText,
                }
              : header,
          );
        }
      }
    } catch {
      /* keep whatever we have locally */
    }
  }

  const merged = [...byId.values()].sort((a, b) => {
    const ta = a.receivedAt ? Date.parse(a.receivedAt) : 0;
    const tb = b.receivedAt ? Date.parse(b.receivedAt) : 0;
    return ta - tb;
  });

  // Lazy-fetch bodies for messages that only have snippets (cap work).
  const needBody = merged.filter(
    (m) => !m.bodyText?.trim() && m.providerMessageId,
  );
  await Promise.all(
    needBody.slice(0, MAX_THREAD_MESSAGES).map(async (m) => {
      try {
        const cached = await ensureMailBodyCached({
          client: admin,
          workspaceId: opts.workspaceId,
          profileId: opts.profileId,
          connectorId: opts.connectorId,
          connectionId: opts.connectionId,
          providerMessageId: m.providerMessageId,
        });
        if (cached.ok && cached.bodyText?.trim()) {
          m.bodyText = cached.bodyText;
        }
      } catch {
        /* keep snippet */
      }
    }),
  );

  return merged.length ? merged.slice(-MAX_THREAD_MESSAGES) : [opts.latest];
}

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

  // Prefer full body so the Expert can decide from real content, not a subject.
  let bodyText: string | null = null;
  try {
    const admin = createSupabaseAdminClient();
    const cached = await ensureMailBodyCached({
      client: admin,
      workspaceId: opts.workspaceId,
      profileId: opts.profileId,
      connectorId: opts.connectorId,
      connectionId: opts.connectionId,
      providerMessageId: opts.message.providerMessageId,
    });
    if (cached.ok) bodyText = cached.bodyText;
  } catch {
    /* snippet fallback below */
  }

  const message: MailSituationHeader = {
    providerMessageId: opts.message.providerMessageId,
    fromAddr: opts.message.fromAddr ?? null,
    toAddrs: opts.message.toAddrs,
    subject: opts.message.subject ?? null,
    snippet: opts.message.snippet ?? null,
    bodyText: bodyText || opts.message.snippet || null,
    receivedAt: opts.message.receivedAt ?? null,
    threadId: opts.message.threadId ?? null,
  };

  const threadMessages = await loadMailThreadForSituation({
    workspaceId: opts.workspaceId,
    profileId: opts.profileId,
    connectionId: opts.connectionId,
    connectorId: opts.connectorId,
    latest: message,
  });

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

    const baseSituation = formatMailSituation({ message, threadMessages });

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
          message,
          threadMessages,
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
