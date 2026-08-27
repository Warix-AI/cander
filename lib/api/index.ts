import { createLocalBuildRuntimeApi } from "@/lib/api/build-runtime-api";
import type { BuildRuntimeApi } from "@/lib/api/build-runtime-api";
import { createLocalChatApi } from "@/lib/api/chat-api.local";
import { createSupabaseChatApi } from "@/lib/api/chat-api.supabase";
import type { ChatApi } from "@/lib/api/chat-api";
import { createLocalConnectorApi } from "@/lib/api/connector-api";
import type { ConnectorApi } from "@/lib/api/connector-api";
import { createLocalBrowserApi } from "@/lib/api/browser-api";
import type { BrowserApi } from "@/lib/api/browser-api";
import { createLocalSpaceEntityApi } from "@/lib/api/space-entity-api.local";
import type { SpaceEntityApi } from "@/lib/api/space-entity-api";
import type { DataBackend } from "@/lib/data-backend";

export type ApiBundle = {
  entities: SpaceEntityApi;
  chat: ChatApi;
  connectors: ConnectorApi;
  build: BuildRuntimeApi;
  browser: BrowserApi;
};

export function createLocalApiBundle(): ApiBundle {
  return {
    entities: createLocalSpaceEntityApi(),
    chat: createLocalChatApi(),
    connectors: createLocalConnectorApi(),
    build: createLocalBuildRuntimeApi(),
    browser: createLocalBrowserApi(),
  };
}

let warnedSupabaseEntityFallback = false;

export function createApiBundle(mode: DataBackend): ApiBundle {
  if (mode === "supabase") {
    if (
      typeof window !== "undefined" &&
      process.env.NODE_ENV === "development" &&
      !warnedSupabaseEntityFallback
    ) {
      warnedSupabaseEntityFallback = true;
      console.warn(
        "[cander] DATA_BACKEND=supabase — entity adapters still local until Phase 1 lands.",
      );
    }
    return {
      entities: createLocalSpaceEntityApi(),
      chat: createSupabaseChatApi(),
      connectors: createLocalConnectorApi(),
      build: createLocalBuildRuntimeApi(),
      browser: createLocalBrowserApi(),
    };
  }
  return createLocalApiBundle();
}

export type { SpaceEntityApi } from "@/lib/api/space-entity-api";
export type { ChatApi } from "@/lib/api/chat-api";
export type { ConnectorApi } from "@/lib/api/connector-api";
export type { BuildRuntimeApi } from "@/lib/api/build-runtime-api";
export type { BrowserApi } from "@/lib/api/browser-api";
