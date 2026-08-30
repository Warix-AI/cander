"use client";

import { getActiveBrowserContextTab } from "@/lib/browser-context/active-tab";
import type {
  BrowserContextProvider,
  PageContext,
  PageSelection,
  ReadPageOptions,
  ViewportCapture,
} from "@/lib/browser-context/types";
import {
  DEFAULT_PAGE_TEXT_LIMIT,
  isSensitiveBrowserUrl,
} from "@/lib/browser-context/types";
import { getActiveComputerSession } from "@/lib/computer/active-session";

type CapBrowser = {
  readPage?: (opts: { tabId: string }) => Promise<Record<string, unknown>>;
  getSelection?: (opts: {
    tabId: string;
  }) => Promise<{ text?: string; url?: string }>;
  captureViewport?: (opts: {
    tabId: string;
  }) => Promise<{
    dataBase64?: string;
    mimeType?: string;
    width?: number;
    height?: number;
  }>;
};

function getPlugin(): CapBrowser | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as Window & {
      Capacitor?: { Plugins?: { CanderBrowser?: CapBrowser } };
    }
  ).Capacitor;
  return cap?.Plugins?.CanderBrowser ?? null;
}

async function readAgent(
  tab: NonNullable<ReturnType<typeof getActiveBrowserContextTab>>,
  options?: ReadPageOptions,
): Promise<PageContext> {
  const { computerBrowserAction } = await import("@/lib/api/computer-client");
  const sessionId =
    tab.sessionId ?? getActiveComputerSession()?.sessionId ?? undefined;
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
  const result = await computerBrowserAction({ sessionId, action: "observe" });
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
    mainContent: text,
    capturedAt: new Date().toISOString(),
  };
}

export function createCapacitorBrowserContextProvider(): BrowserContextProvider {
  return {
    async getActiveTab() {
      return getActiveBrowserContextTab();
    },

    async readActivePage(options) {
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
        return readAgent(tab, options);
      }
      if (isSensitiveBrowserUrl(tab.url)) {
        return {
          tabId: tab.tabId,
          tabKind: tab.tabKind,
          projectId: tab.projectId,
          url: tab.url,
          title: tab.title,
          visibleText: "",
          capturedAt: new Date().toISOString(),
          limitation:
            "This looks like a sensitive page. Ask the user before reading personal or financial content.",
        };
      }
      const plugin = getPlugin();
      if (!plugin?.readPage) {
        return {
          tabId: tab.tabId,
          tabKind: tab.tabKind,
          projectId: tab.projectId,
          url: tab.url,
          title: tab.title,
          visibleText: "",
          capturedAt: new Date().toISOString(),
          limitation: "CanderBrowser readPage unavailable — update the iOS app.",
        };
      }
      const extracted = await plugin.readPage({ tabId: tab.tabId });
      const max = options?.maxTextChars ?? DEFAULT_PAGE_TEXT_LIMIT;
      const visibleText = String(extracted.visibleText ?? "").slice(0, max);
      const page: PageContext = {
        tabId: tab.tabId,
        tabKind: tab.tabKind,
        projectId: tab.projectId,
        url: String(extracted.url || tab.url),
        title: String(extracted.title || tab.title),
        visibleText,
        mainContent: extracted.mainContent
          ? String(extracted.mainContent).slice(0, max)
          : undefined,
        headings: Array.isArray(extracted.headings)
          ? (extracted.headings as string[])
          : undefined,
        links: Array.isArray(extracted.links)
          ? (extracted.links as PageContext["links"])
          : undefined,
        selectedText: extracted.selectedText
          ? String(extracted.selectedText)
          : undefined,
        viewport: extracted.viewport as PageContext["viewport"],
        truncated: Boolean(extracted.truncated) || visibleText.length >= max,
        capturedAt: new Date().toISOString(),
      };
      if (options?.includeScreenshot && plugin.captureViewport) {
        try {
          page.screenshot = await this.captureActiveViewport();
        } catch {
          // optional
        }
      }
      return page;
    },

    async getSelection(): Promise<PageSelection | null> {
      const tab = getActiveBrowserContextTab();
      if (!tab || tab.tabKind === "agent-browser") return null;
      const plugin = getPlugin();
      if (!plugin?.getSelection) return null;
      const sel = await plugin.getSelection({ tabId: tab.tabId });
      const text = String(sel?.text ?? "").trim();
      if (!text) return null;
      return { text, url: sel?.url || tab.url, tabId: tab.tabId };
    },

    async captureActiveViewport(): Promise<ViewportCapture> {
      const tab = getActiveBrowserContextTab();
      if (!tab) throw new Error("No active browser tab.");
      const plugin = getPlugin();
      if (!plugin?.captureViewport) {
        throw new Error("CanderBrowser captureViewport unavailable.");
      }
      const shot = await plugin.captureViewport({ tabId: tab.tabId });
      if (!shot.dataBase64) throw new Error("Empty viewport capture.");
      return {
        tabId: tab.tabId,
        url: tab.url,
        mimeType: (shot.mimeType as "image/jpeg" | "image/png") || "image/jpeg",
        dataBase64: shot.dataBase64,
        width: shot.width ?? 0,
        height: shot.height ?? 0,
        capturedAt: new Date().toISOString(),
      };
    },
  };
}
