import type {
  CreateThreadInput,
  EntityRef,
  SendMessageInput,
  ThreadFilter,
  WorkspaceCtx,
} from "@/lib/space-entities";
import type { Message, Thread } from "@/lib/types";

export type ChatApi = {
  listThreads(ctx: WorkspaceCtx, filter?: ThreadFilter): Promise<Thread[]>;
  getThread(ctx: WorkspaceCtx, id: string): Promise<Thread | null>;
  createThread(ctx: WorkspaceCtx, input: CreateThreadInput): Promise<Thread>;
  listMessages(ctx: WorkspaceCtx, threadId: string): Promise<Message[]>;
  sendMessage(
    ctx: WorkspaceCtx,
    threadId: string,
    input: SendMessageInput,
  ): Promise<Message>;
};

/** Bridge for AppProvider-owned thread state until threads move into the store. */
export type ChatApiBridge = {
  listThreads: (ctx: WorkspaceCtx, filter?: ThreadFilter) => Thread[];
  getThread: (ctx: WorkspaceCtx, id: string) => Thread | null;
  createThread: (ctx: WorkspaceCtx, input: CreateThreadInput) => Thread;
  listMessages: (ctx: WorkspaceCtx, threadId: string) => Message[];
  sendMessage: (
    ctx: WorkspaceCtx,
    threadId: string,
    input: SendMessageInput,
  ) => Message;
  subscribe: (listener: () => void) => () => void;
};

let chatBridge: ChatApiBridge | null = null;

export function registerChatApiBridge(bridge: ChatApiBridge | null) {
  chatBridge = bridge;
}

export function createChatApiFromBridge(): ChatApi {
  return {
    async listThreads(ctx, filter) {
      if (!chatBridge) return [];
      return chatBridge.listThreads(ctx, filter);
    },
    async getThread(ctx, id) {
      if (!chatBridge) return null;
      return chatBridge.getThread(ctx, id);
    },
    async createThread(ctx, input) {
      if (!chatBridge) {
        throw new Error("ChatApi bridge not registered");
      }
      return chatBridge.createThread(ctx, input);
    },
    async listMessages(ctx, threadId) {
      if (!chatBridge) return [];
      return chatBridge.listMessages(ctx, threadId);
    },
    async sendMessage(ctx, threadId, input) {
      if (!chatBridge) {
        throw new Error("ChatApi bridge not registered");
      }
      return chatBridge.sendMessage(ctx, threadId, input);
    },
  };
}
