/**
 * Platform-neutral browser context for the active right-panel tab.
 * Chat reads the selected tab only — never all tabs.
 */

export type BrowserContextTabKind =
  | "build-preview"
  | "project-preview"
  | "web"
  | "agent-browser";

export type ActiveBrowserTab = {
  tabId: string;
  tabKind: BrowserContextTabKind;
  title: string;
  url: string;
  projectId?: string;
  sessionId?: string;
  /** Platform surface can extract text / screenshots. */
  canReadText: boolean;
  canCaptureViewport: boolean;
};

export type PageSelection = {
  text: string;
  url: string;
  tabId: string;
};

export type ViewportCapture = {
  tabId: string;
  url: string;
  mimeType: "image/jpeg" | "image/png";
  /** Base64 without data: URL prefix. */
  dataBase64: string;
  width: number;
  height: number;
  capturedAt: string;
};

export type ReadPageOptions = {
  /** Prefer visual capture when true (layout / appearance questions). */
  includeScreenshot?: boolean;
  maxTextChars?: number;
};

export type PageContext = {
  tabId: string;
  tabKind: BrowserContextTabKind;
  projectId?: string;
  sessionId?: string;
  url: string;
  title: string;
  visibleText: string;
  mainContent?: string;
  headings?: string[];
  links?: Array<{ text: string; href: string }>;
  selectedText?: string;
  viewport?: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  };
  truncated?: boolean;
  capturedAt: string;
  /** Present when a screenshot was requested / required. */
  screenshot?: ViewportCapture;
  /** Why inspection failed or was limited (e.g. PWA cross-origin). */
  limitation?: string;
};

export type BrowserNavigationAction =
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "navigate"; url: string };

export type BrowserActionResult = {
  ok: boolean;
  detail: string;
};

export interface BrowserContextProvider {
  getActiveTab(): Promise<ActiveBrowserTab | null>;
  readActivePage(options?: ReadPageOptions): Promise<PageContext>;
  getSelection(): Promise<PageSelection | null>;
  captureActiveViewport(): Promise<ViewportCapture>;
  navigate?(action: BrowserNavigationAction): Promise<BrowserActionResult>;
}

export const DEFAULT_PAGE_TEXT_LIMIT = 12_000;

/** Domains that require extra caution before reading page content. */
export const SENSITIVE_HOST_RE =
  /\b(bank|chase|wellsfargo|paypal|stripe\.com|accounts\.google|login\.microsoft|id\.me|healthcare|myhealth|irs\.gov|ssa\.gov)\b/i;

export function isSensitiveBrowserUrl(url: string): boolean {
  try {
    return SENSITIVE_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
