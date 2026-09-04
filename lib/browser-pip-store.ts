/**
 * In-app browser Picture-in-Picture — keeps one web surface floating over the shell
 * after pop-out or leaving a project.
 */

export type BrowserPipState = {
  tabId: string;
  url: string;
  title: string;
  faviconUrl: string | null;
  userId: string;
  sourceProjectId: string | null;
  /** Web PWA only — render iframe in the overlay instead of a native view. */
  webEmbed: boolean;
  /** Overlay size in CSS px (content area, excluding chrome). */
  width: number;
  height: number;
};

export const DEFAULT_PIP_WIDTH = 360;
export const DEFAULT_PIP_HEIGHT = 202; // ~16:9
export const PIP_CHROME_HEIGHT = 36;
export const PIP_MIN_WIDTH = 240;
export const PIP_MIN_HEIGHT = 135;
export const PIP_MAX_WIDTH = 720;
export const PIP_MAX_HEIGHT = 480;

type Listener = () => void;

let pip: BrowserPipState | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeBrowserPip(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBrowserPipSnapshot(): BrowserPipState | null {
  return pip;
}

export function getBrowserPipServerSnapshot(): BrowserPipState | null {
  return null;
}

export function isBrowserPipTab(tabId: string): boolean {
  return pip?.tabId === tabId;
}

export function enterBrowserPip(next: BrowserPipState) {
  pip = {
    tabId: next.tabId,
    url: next.url,
    title: next.title || "Browser",
    faviconUrl: next.faviconUrl ?? null,
    userId: next.userId,
    sourceProjectId: next.sourceProjectId,
    webEmbed: Boolean(next.webEmbed),
    width: next.width || DEFAULT_PIP_WIDTH,
    height: next.height || DEFAULT_PIP_HEIGHT,
  };
  emit();
}

export function updateBrowserPipMeta(
  patch: Partial<
    Pick<BrowserPipState, "url" | "title" | "faviconUrl" | "width" | "height">
  >,
) {
  if (!pip) return;
  pip = { ...pip, ...patch };
  emit();
}

export function updateBrowserPipSize(width: number, height: number) {
  if (!pip) return;
  pip = {
    ...pip,
    width: Math.min(PIP_MAX_WIDTH, Math.max(PIP_MIN_WIDTH, Math.round(width))),
    height: Math.min(
      PIP_MAX_HEIGHT,
      Math.max(PIP_MIN_HEIGHT, Math.round(height)),
    ),
  };
  emit();
}

export function exitBrowserPip() {
  if (!pip) return;
  pip = null;
  emit();
}
