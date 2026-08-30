"use client";

import { getActiveBrowserContextTab } from "@/lib/browser-context/active-tab";
import { PAGE_EXTRACT_SCRIPT, SELECTION_SCRIPT } from "@/lib/browser-context/extract-script";
import type {
  ActiveBrowserTab,
  BrowserActionResult,
  BrowserContextProvider,
  BrowserNavigationAction,
  PageContext,
  PageSelection,
  ReadPageOptions,
  ViewportCapture,
} from "@/lib/browser-context/types";
import {
  DEFAULT_PAGE_TEXT_LIMIT,
  isSensitiveBrowserUrl,
} from "@/lib/browser-context/types";
import { getCanderDesktopBridge } from "@/lib/desktop-shell";
import { getActiveComputerSession } from "@/lib/computer/active-session";

type ExtractedPage = {
  url?: string;
  title?: string;
  visibleText?: string;
  mainContent?: string;
  headings?: string[];
  links?: Array<{ text: string; href: string }>;
  selectedText?: string;
  viewport?: PageContext["viewport"];
  truncated?: boolean;
};

function desktopBrowser() {
  return getCanderDesktopBridge()?.browser as
    | (NonNullable<ReturnType<typeof getCanderDesktopBridge>>["browser"] & {
        readPage?: (tabId: string) => Promise<ExtractedPage>;
        getSelection?: (tabId: string) => Promise<{ text?: string; url?: string }>;
        captureViewport?: (
          tabId: string,
        ) => Promise<{
          dataBase64: string;
          mimeType?: string;
          width?: number;
          height?: number;
        }>;
      })
    | undefined;
}

async function readAgentBrowserPage(
  tab: ActiveBrowserTab,
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
  const result = await computerBrowserAction({
    sessionId,
    action: "observe",
  });
  const obs = result.observation;
  const text = (obs?.snapshot ?? "").slice(
    0,
    options?.maxTextChars ?? DEFAULT_PAGE_TEXT_LIMIT,
  );
  return {
    tabId: tab.tabId,
    tabKind: "agent-browser",
    projectId: tab.projectId,
    sessionId,
    url: obs?.url ?? tab.url,
    title: obs?.title ?? tab.title,
    visibleText: text,
    mainContent: text,
    truncated: (obs?.snapshot?.length ?? 0) > text.length,
    capturedAt: new Date().toISOString(),
  };
}

export function createElectronBrowserContextProvider(): BrowserContextProvider {
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
        const page = await readAgentBrowserPage(tab, options);
        if (options?.includeScreenshot) {
          try {
            page.screenshot = await this.captureActiveViewport();
          } catch {
            // optional
          }
        }
        return page;
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
      const bridge = desktopBrowser();
      if (!bridge?.readPage) {
        return {
          tabId: tab.tabId,
          tabKind: tab.tabKind,
          projectId: tab.projectId,
          url: tab.url,
          title: tab.title,
          visibleText: "",
          capturedAt: new Date().toISOString(),
          limitation: "Desktop browser read bridge unavailable — update the shell.",
        };
      }
      const extracted = (await bridge.readPage(tab.tabId)) as ExtractedPage;
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
        headings: extracted.headings,
        links: extracted.links,
        selectedText: extracted.selectedText,
        viewport: extracted.viewport,
        truncated: Boolean(extracted.truncated) || visibleText.length >= max,
        capturedAt: new Date().toISOString(),
      };
      if (options?.includeScreenshot) {
        try {
          page.screenshot = await this.captureActiveViewport();
        } catch {
          // optional
        }
      }
      return page;
    },

    async getSelection() {
      const tab = getActiveBrowserContextTab();
      if (!tab || tab.tabKind === "agent-browser") return null;
      const bridge = desktopBrowser();
      if (!bridge?.getSelection) return null;
      const sel = await bridge.getSelection(tab.tabId);
      const text = String(sel?.text ?? "").trim();
      if (!text) return null;
      return { text, url: sel?.url || tab.url, tabId: tab.tabId };
    },

    async captureActiveViewport() {
      const tab = getActiveBrowserContextTab();
      if (!tab) {
        throw new Error("No active browser tab.");
      }
      if (tab.tabKind === "agent-browser") {
        throw new Error(
          "Viewport capture for agent-browser uses computer session screenshots — not yet wired.",
        );
      }
      const bridge = desktopBrowser();
      if (!bridge?.captureViewport) {
        throw new Error("Desktop capture bridge unavailable.");
      }
      const shot = await bridge.captureViewport(tab.tabId);
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

    async navigate(action: BrowserNavigationAction): Promise<BrowserActionResult> {
      const tab = getActiveBrowserContextTab();
      if (!tab) return { ok: false, detail: "No active tab." };
      const bridge = desktopBrowser();
      if (!bridge) return { ok: false, detail: "No desktop bridge." };
      if (action.type === "back") await bridge.back(tab.tabId);
      else if (action.type === "forward") await bridge.forward(tab.tabId);
      else if (action.type === "reload") await bridge.reload(tab.tabId);
      else if (action.type === "navigate") await bridge.navigate(tab.tabId, action.url);
      return { ok: true, detail: `Performed ${action.type}` };
    },
  };
}

/** Shared script strings for native hosts to inject. */
export { PAGE_EXTRACT_SCRIPT, SELECTION_SCRIPT };
