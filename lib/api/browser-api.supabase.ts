"use client";

import type { BrowserApi } from "@/lib/api/browser-api";
import type { SpaceEntityApi } from "@/lib/api/space-entity-api";
import {
  getBrowserSessionSnapshot,
  setBrowserSession,
  subscribeBrowserSession,
} from "@/lib/browser-session";
import type { BrowserPage, EntityRef, WorkspaceCtx } from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

function titleFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function createSupabaseBrowserApi(entities: SpaceEntityApi): BrowserApi {
  return {
    async navigate(ctx, url) {
      const page = { url, title: titleFromUrl(url) };
      setBrowserSession(ctx.actorId, ctx.workspaceId, page);
      return page;
    },

    async getCurrentPage(ctx) {
      return getBrowserSessionSnapshot(ctx.actorId, ctx.workspaceId);
    },

    async captureReference(ctx, page, opts) {
      const space = opts?.space ?? "research";
      const source = await entities.createSource(ctx, {
        space,
        title: page.title,
        kind: "web",
        url: page.url,
        projectId: opts?.projectId,
      });
      return {
        sourceId: source.id,
        ref: {
          type: "source",
          id: source.id,
          space,
          workspaceId: ctx.workspaceId,
          label: page.title,
          snapshot: page.url,
        } satisfies EntityRef,
      };
    },

    subscribe(listener) {
      return subscribeBrowserSession(listener);
    },
  };
}
