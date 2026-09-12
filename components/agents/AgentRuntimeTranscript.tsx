"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAgentConversationClient,
  listProjectAgentsWithStatsClient,
} from "@/lib/agents/client";
import { peekCachedProjectAgents } from "@/lib/agents/cache";
import type {
  AgentConversationMessage,
  ProjectAgent,
} from "@/lib/agents/types";
import { ChatMessage } from "@/components/chat/MessageBlocks";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

export const AGENT_RUNTIME_REFRESH_EVENT = "cander:agent-runtime-refresh";

export function notifyAgentRuntimeRefresh(detail: {
  projectId: string;
  agentId?: string | null;
}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AGENT_RUNTIME_REFRESH_EVENT, { detail }),
  );
}

/** Left-column Agent ↔ Cander runtime dialogue (observe only). */
export function AgentRuntimeTranscript({
  workspaceId,
  projectId,
  className,
}: {
  workspaceId: string;
  projectId: string;
  className?: string;
}) {
  const [agent, setAgent] = useState<ProjectAgent | null>(
    () => peekCachedProjectAgents(workspaceId, projectId)?.[0] ?? null,
  );
  const [messages, setMessages] = useState<AgentConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const listed = await listProjectAgentsWithStatsClient({
      workspaceId,
      projectId,
      force: true,
    });
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
  }, [workspaceId, projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void reload()
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load conversation.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { projectId?: string }
        | undefined;
      if (detail?.projectId && detail.projectId !== projectId) return;
      void reload().catch(() => {});
    };
    window.addEventListener(AGENT_RUNTIME_REFRESH_EVENT, onRefresh);
    const poll = window.setInterval(() => {
      void reload().catch(() => {});
    }, 8_000);

    return () => {
      cancelled = true;
      window.removeEventListener(AGENT_RUNTIME_REFRESH_EVENT, onRefresh);
      window.clearInterval(poll);
    };
  }, [reload, projectId]);

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

  if (loading && !chatMessages.length) {
    return (
      <div
        className={cn(
          "flex flex-1 items-center justify-center text-[13px] text-muted-foreground",
          className,
        )}
      >
        Loading agent conversation…
      </div>
    );
  }

  if (error && !chatMessages.length) {
    return (
      <div
        className={cn(
          "px-1 py-8 text-center text-[13px] text-destructive",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  if (!chatMessages.length) {
    return (
      <div
        className={cn(
          "mx-auto flex max-w-md flex-col items-center py-16 text-center",
          className,
        )}
      >
        <p className="text-[14px] font-medium tracking-[-0.02em]">
          No conversation yet
        </p>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          When this agent wakes (or you press Run now), its dialogue with Cander
          appears here. You watch — you don’t type.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex w-full flex-col gap-5", className)}>
      {chatMessages.map((message) => (
        <div key={message.id} className="flex flex-col gap-1">
          <span className="px-1 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
            {message.role === "user" ? agent?.name || "Agent" : "Cander"}
          </span>
          <ChatMessage message={message} />
        </div>
      ))}
    </div>
  );
}
