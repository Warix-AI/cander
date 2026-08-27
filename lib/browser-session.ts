import type { BrowserPage } from "@/lib/space-entities";

type Listener = () => void;

const STORAGE_KEY = "courier-browser-session";
const DEFAULT_URL = "https://openai.com/api/pricing";

const listeners = new Set<Listener>();
let session: BrowserPage | null = null;
let sessionKey = "";
let hydrated = false;
let revision = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

function storageKey(profileId: string, workspaceId: string) {
  return `${profileId}:${workspaceId}`;
}

function titleFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function parse(raw: string | null): BrowserPage | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<BrowserPage>;
    if (!data.url) return null;
    return {
      url: String(data.url),
      title: String(data.title ?? titleFromUrl(String(data.url))),
    };
  } catch {
    return null;
  }
}

function hydrate(profileId: string, workspaceId: string) {
  const key = storageKey(profileId, workspaceId);
  if (hydrated && sessionKey === key) return;
  hydrated = true;
  sessionKey = key;
  if (typeof window === "undefined") {
    session = { url: DEFAULT_URL, title: titleFromUrl(DEFAULT_URL) };
    return;
  }
  session =
    parse(window.localStorage.getItem(`${STORAGE_KEY}:${key}`)) ?? {
      url: DEFAULT_URL,
      title: titleFromUrl(DEFAULT_URL),
    };
}

function persist() {
  if (typeof window === "undefined" || !session) return;
  window.localStorage.setItem(
    `${STORAGE_KEY}:${sessionKey}`,
    JSON.stringify(session),
  );
  revision += 1;
  emit();
}

export function subscribeBrowserSession(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBrowserSessionSnapshot(
  profileId: string,
  workspaceId: string,
) {
  hydrate(profileId, workspaceId);
  return session;
}

export function getBrowserSessionRevision() {
  return revision;
}

export function setBrowserSession(
  profileId: string,
  workspaceId: string,
  page: BrowserPage,
) {
  hydrate(profileId, workspaceId);
  session = page;
  persist();
}

export function replaceBrowserSessionState(
  profileId: string,
  workspaceId: string,
  page: BrowserPage | null,
) {
  sessionKey = storageKey(profileId, workspaceId);
  hydrated = true;
  session = page ?? {
    url: DEFAULT_URL,
    title: titleFromUrl(DEFAULT_URL),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      `${STORAGE_KEY}:${sessionKey}`,
      JSON.stringify(session),
    );
  }
  revision += 1;
  emit();
}

export function defaultBrowserPage(): BrowserPage {
  return { url: DEFAULT_URL, title: titleFromUrl(DEFAULT_URL) };
}
