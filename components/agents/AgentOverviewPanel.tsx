"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, LoaderCircle, Pencil, Play } from "lucide-react";
import {
  fetchAgentConversationClient,
  listProjectAgentsWithStatsClient,
  runAgentClient,
} from "@/lib/agents/client";
import { peekCachedProjectAgents } from "@/lib/agents/cache";
import type {
  AgentConversationMessage,
  ProjectAgent,
} from "@/lib/agents/types";
import { ChatMessage } from "@/components/chat/MessageBlocks";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BROWSER_CHROME_BG } from "@/lib/shell-chrome";

export function AgentOverviewPanel({
  workspaceId,
  projectId,
  projectTitle,
  onEditInProject,
}: {
  workspaceId: string;
  projectId: string;
  projectTitle?: string;
  onEditInProject: () => void;
}) {
  const [agents, setAgents] = useState<ProjectAgent[]>(
    () => peekCachedProjectAgents(workspaceId, projectId) ?? [],
  );
  const [agent, setAgent] = useState<ProjectAgent | null>(null);
  const [messages, setMessages] = useState<AgentConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);

  const primaryId = agents[0]?.id ?? agent?.id ?? null;

  const reload = async () => {
    const listed = await listProjectAgentsWithStatsClient({
      workspaceId,
      projectId,
      force: true,
    });
    setAgents(listed.agents);
    const id = listed.agents[0]?.id;
    if (!id) {
      setAgent(null);
      setMessages([]);
      return;
    }
    const conv = await fetchAgentConversationClient({
      workspaceId,
      projectId,
      agentId: id,
    });
    setAgent(conv.agent);
    setMessages(conv.messages);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void reload()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load agent.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on project change
  }, [workspaceId, projectId]);

  const chatMessages: Message[] = useMemo(() => {
    return messages
      .filter((m) => m.role === "agent" || m.role === "cander")
      .map((m) => ({
        id: m.id,
        role: m.role === "agent" ? ("user" as const) : ("assistant" as const),
        content: m.content,
        at: m.createdAt,
        status: "complete" as const,
      }));
  }, [messages]);

  const handleRun = async () => {
    if (!primaryId || runBusy) return;
    setRunBusy(true);
    setError(null);
    try {
      await runAgentClient({
        workspaceId,
        projectId,
        agentId: primaryId,
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed.");
    } finally {
      setRunBusy(false);
    }
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", BROWSER_CHROME_BG)}>
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-muted">
          <Bot className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
            Agent · Cander
          </p>
          <h1 className="truncate text-[1.1rem] font-semibold tracking-[-0.02em]">
            {agent?.name ?? projectTitle ?? "Agent"}
          </h1>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            Runtime conversation — observe only
            {agent?.status ? ` · ${agent.status}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={runBusy || !primaryId || agent?.status === "paused"}
            onClick={() => void handleRun()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12.5px] font-medium text-background disabled:opacity-50"
          >
            {runBusy ? (
              <LoaderCircle
                className="h-3.5 w-3.5 animate-spin"
                strokeWidth={1.8}
              />
            ) : (
              <Play className="h-3.5 w-3.5" strokeWidth={1.8} />
            )}
            Run now
          </button>
          <button
            type="button"
            onClick={onEditInProject}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[12.5px] font-medium hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
            Edit
          </button>
        </div>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-border px-4 py-2 text-[12.5px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoaderCircle
              className="h-6 w-6 animate-spin text-muted-foreground"
              strokeWidth={1.75}
            />
          </div>
        ) : !chatMessages.length ? (
          <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
            <p className="text-[14px] font-medium tracking-[-0.02em]">
              No runtime conversation yet
            </p>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              When this agent wakes on its schedule (or you press Run now), its
              dialogue with Cander appears here. You watch — you don’t type.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            {chatMessages.map((message) => (
              <div key={message.id} className="flex flex-col gap-1">
                <span className="px-1 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
                  {message.role === "user" ? agent?.name || "Agent" : "Cander"}
                </span>
                <ChatMessage message={message} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
