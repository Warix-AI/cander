import type { ChatApi } from "@/lib/api/chat-api";
import {
  filterThreads,
  getChatThreads,
  replaceChatThreads,
  subscribeChatStore,
  upsertChatThread,
} from "@/lib/api/chat-store";
import { classifyTurn, researchReply, skillReply } from "@/lib/build-loop";
import { inferIntent, nextId } from "@/lib/intent";
import type {
  CreateThreadInput,
  SendMessageInput,
  ThreadFilter,
  WorkspaceCtx,
} from "@/lib/space-entities";
import type { Message, SpaceId, Thread } from "@/lib/types";
import { imageCoverFromMessages } from "@/lib/chat-image-cover";

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function createThreadRecord(
  ctx: WorkspaceCtx,
  input: CreateThreadInput,
): Thread {
  return {
    id: nextId("t"),
    title: input.title ?? "Chat",
    workspaceId: ctx.workspaceId,
    projectId: input.projectId,
    spaceId: input.spaceId,
    updatedAt: new Date().toISOString(),
    snippet: "",
    messages: [],
  };
}

function composeAssistantReply(
  ctx: WorkspaceCtx,
  content: string,
  spaceId?: SpaceId | null,
): Message {
  const kind = classifyTurn(content);
  const intent = inferIntent(content, ctx.workspaceId, spaceId ?? undefined);

  let assistant: Message = {
    id: nextId("a"),
    role: "assistant",
    content: intent.reply,
    at: nowTime(),
  };

  if (kind === "skill") {
    const skill = skillReply(content);
    assistant = { ...assistant, content: skill.content, blocks: skill.blocks };
  } else if (kind === "research") {
    const research = researchReply();
    assistant = {
      ...assistant,
      content: research.content,
      blocks: research.blocks,
    };
  }

  return assistant;
}

export function createLocalChatApi(): ChatApi {
  return {
    async getThreadCoverUrls(ctx, threadIds) {
      const covers = new Map<string, string>();
      for (const id of threadIds) {
        const thread = getChatThreads().find(
          (item) => item.id === id && item.workspaceId === ctx.workspaceId,
        );
        const url = thread ? imageCoverFromMessages(thread.messages) : undefined;
        if (url) covers.set(id, url);
      }
      return covers;
    },

    async listThreads(ctx, filter?: ThreadFilter) {
      return filterThreads(getChatThreads(), ctx.workspaceId, filter);
    },

    async getThread(ctx, id) {
      const thread = getChatThreads().find(
        (item) => item.id === id && item.workspaceId === ctx.workspaceId,
      );
      return thread ?? null;
    },

    async createThread(ctx, input) {
      const created = createThreadRecord(ctx, input);
      upsertChatThread(created);
      return created;
    },

    async listMessages(ctx, threadId) {
      const thread = await this.getThread(ctx, threadId);
      return thread?.messages ?? [];
    },

    async sendMessage(ctx, threadId, input: SendMessageInput) {
      const trimmed = input.content.trim();
      if (!trimmed) {
        throw new Error("Message cannot be empty");
      }

      const existing = getChatThreads().find(
        (item) => item.id === threadId && item.workspaceId === ctx.workspaceId,
      );

      const userMsg: Message = {
        id: nextId("u"),
        role: "user",
        content: trimmed,
        at: nowTime(),
      };
      const assistantMsg = composeAssistantReply(
        ctx,
        trimmed,
        existing?.spaceId,
      );

      if (existing) {
        const updated: Thread = {
          ...existing,
          title: existing.messages.length ? existing.title : trimmed.slice(0, 48),
          snippet: trimmed,
          updatedAt: new Date().toISOString(),
          sessionSummary: null,
          messages: [...existing.messages, userMsg, assistantMsg],
        };
        upsertChatThread(updated);
        return assistantMsg;
      }

      const created: Thread = {
        id: threadId,
        title: trimmed.slice(0, 52),
        workspaceId: ctx.workspaceId,
        spaceId: undefined,
        updatedAt: new Date().toISOString(),
        snippet: trimmed,
        messages: [userMsg, assistantMsg],
        sessionSummary: null,
      };
      upsertChatThread(created);
      return assistantMsg;
    },
  };
}

export { subscribeChatStore, replaceChatThreads };
