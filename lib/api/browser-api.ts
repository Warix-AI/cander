import { localSpaceEntityStore } from "@/lib/api/space-entity-store";
import type { BrowserPage, EntityRef, WorkspaceCtx } from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

export type BrowserApi = {
  navigate(ctx: WorkspaceCtx, url: string): Promise<BrowserPage>;
  getCurrentPage(ctx: WorkspaceCtx): Promise<BrowserPage | null>;
  captureReference(
    ctx: WorkspaceCtx,
    page: BrowserPage,
    opts?: { space?: SpaceId; projectId?: string },
  ): Promise<{ sourceId: string; ref: EntityRef }>;
  subscribe?(listener: () => void): () => void;
};

type BrowserState = {
  current: BrowserPage | null;
};

const browserState: BrowserState = { current: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function titleFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function createLocalBrowserApi(): BrowserApi {
  return {
    async navigate(_ctx, url) {
      const page = { url, title: titleFromUrl(url) };
      browserState.current = page;
      emit();
      return page;
    },
    async getCurrentPage() {
      return browserState.current;
    },
    async captureReference(ctx, page, opts) {
      const space = opts?.space ?? "research";
      const source = localSpaceEntityStore.createSource(ctx, {
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
        },
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
