"use client";

import { getActiveBrowserContextTab } from "@/lib/browser-context/active-tab";
import type {
  BrowserContextProvider,
  PageContext,
  ReadPageOptions,
  ViewportCapture,
} from "@/lib/browser-context/types";
import { DEFAULT_PAGE_TEXT_LIMIT } from "@/lib/browser-context/types";
import { canEmbedInPwa } from "@/lib/browser-surface/local-browsing";
import { getActiveComputerSession } from "@/lib/computer/active-session";

/**
 * Web / PWA: only same-origin / Cander-owned previews are readable in-panel.
 * External sites fall back to server retrieval or agent-browser.
 */
export function createWebPwaBrowserContextProvider(): BrowserContextProvider {
  return {
    async getActiveTab() {
      return getActiveBrowserContextTab();
    },

    async readActivePage(options?: ReadPageOptions): Promise<PageContext> {
      const tab = getActiveBrowserContextTab();
      if (!tab) {
        return {
          tabId: "",
          tabKind: "web",
          url: "",
          title: "",
          visibleText: "",
          capturedAt: new Date().toISOString(),
          limitation: "No active browser tab in the right panel.",
        };
      }
      if (tab.tabKind === "agent-browser") {
        const { computerBrowserAction } = await import(
          "@/lib/api/computer-client"
        );
        const sessionId =
          tab.sessionId ?? getActiveComputerSession()?.sessionId;
        if (!sessionId) {
          return {
            tabId: tab.tabId,
            tabKind: tab.tabKind,
            url: tab.url,
            title: tab.title,
            visibleText: "",
            capturedAt: new Date().toISOString(),
            limitation: "No active agent-browser session.",
          };
        }
        const result = await computerBrowserAction({
          sessionId,
          action: "observe",
        });
        const text = String(result.observation?.snapshot ?? "").slice(
          0,
          options?.maxTextChars ?? DEFAULT_PAGE_TEXT_LIMIT,
        );
        return {
          tabId: tab.tabId,
          tabKind: "agent-browser",
          projectId: tab.projectId,
          sessionId,
          url: result.observation?.url ?? tab.url,
          title: result.observation?.title ?? tab.title,
          visibleText: text,
          capturedAt: new Date().toISOString(),
        };
      }

      // Same-origin / embeddable preview: try iframe DOM (often blocked cross-origin).
      if (canEmbedInPwa(tab.url, tab.tabKind !== "web")) {
        try {
          const iframe = document.querySelector(
            `iframe[data-tab-id="${CSS.escape(tab.tabId)}"], iframe[title="${CSS.escape(tab.title)}"]`,
          ) as HTMLIFrameElement | null;
          const doc = iframe?.contentDocument;
          if (doc?.body) {
            const text = (doc.body.innerText || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, options?.maxTextChars ?? DEFAULT_PAGE_TEXT_LIMIT);
            return {
              tabId: tab.tabId,
              tabKind: tab.tabKind,
              projectId: tab.projectId,
              url: tab.url,
              title: doc.title || tab.title,
              visibleText: text,
              capturedAt: new Date().toISOString(),
            };
          }
        } catch {
          // fall through to server fetch
        }
      }

      // Public URL retrieval via existing web.open action bridge.
      try {
        const { getAppActionHandlers } = await import(
          "@/lib/ai/runtime/app-actions"
        );
        const handlers = getAppActionHandlers();
        if (handlers?.webOpen) {
          const opened = await handlers.webOpen(tab.url);
          const text = String(opened.text ?? "").slice(
            0,
            options?.maxTextChars ?? DEFAULT_PAGE_TEXT_LIMIT,
          );
          return {
            tabId: tab.tabId,
            tabKind: tab.tabKind,
            projectId: tab.projectId,
            url: opened.finalUrl || opened.url || tab.url,
            title: opened.title || tab.title,
            visibleText: text,
            mainContent: text,
            truncated: (opened.text?.length ?? 0) > text.length,
            capturedAt: new Date().toISOString(),
            limitation: opened.ok
              ? undefined
              : opened.detail ||
                "Could not retrieve page text from the web app.",
          };
        }
      } catch {
        // ignore
      }

      return {
        tabId: tab.tabId,
        tabKind: tab.tabKind,
        projectId: tab.projectId,
        url: tab.url,
        title: tab.title,
        visibleText: "",
        capturedAt: new Date().toISOString(),
        limitation:
          "The web app cannot inspect this external page in-panel. Use the macOS or iOS app, or ask to open it with the agent browser.",
      };
    },

    async getSelection() {
      return null;
    },

    async captureActiveViewport(): Promise<ViewportCapture> {
      throw new Error(
        "Viewport capture is not available in the web app for arbitrary sites.",
      );
    },
  };
}
