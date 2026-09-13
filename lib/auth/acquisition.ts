/**
 * Client-side acquisition context (UTM, referrer, landing) persisted for signup.
 */

const STORAGE_KEY = "cander-acquisition-v1";

export type AcquisitionContext = {
  landingUrl: string;
  landingPath: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  gclid: string;
  fbclid: string;
  timezone: string;
  locale: string;
  screenWidth: number | null;
  screenHeight: number | null;
  capturedAt: string;
};

function readParam(params: URLSearchParams, key: string) {
  return (params.get(key) ?? "").trim().slice(0, 200);
}

function fromLocation(): AcquisitionContext | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const params = url.searchParams;
  return {
    landingUrl: url.href.slice(0, 2000),
    landingPath: `${url.pathname}${url.search}`.slice(0, 500),
    referrer: (document.referrer || "").slice(0, 2000),
    utmSource: readParam(params, "utm_source"),
    utmMedium: readParam(params, "utm_medium"),
    utmCampaign: readParam(params, "utm_campaign"),
    utmTerm: readParam(params, "utm_term"),
    utmContent: readParam(params, "utm_content"),
    gclid: readParam(params, "gclid"),
    fbclid: readParam(params, "fbclid"),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    locale: navigator.language || "",
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    capturedAt: new Date().toISOString(),
  };
}

/** Capture once per browser session (first paint wins). */
export function captureAcquisitionContext(): AcquisitionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing) {
      return JSON.parse(existing) as AcquisitionContext;
    }
  } catch {
    // ignore
  }
  const next = fromLocation();
  if (!next) return null;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota
  }
  return next;
}

export function getAcquisitionContext(): AcquisitionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AcquisitionContext;
  } catch {
    // ignore
  }
  return captureAcquisitionContext();
}

export type AuthEventType =
  | "visit"
  | "signup_started"
  | "signup_created"
  | "signup_existing"
  | "email_verified"
  | "signed_in"
  | "onboarding_completed"
  | "password_reset_requested";

/** Fire-and-forget client → /api/auth/events. */
export function reportAuthEvent(input: {
  eventType: AuthEventType;
  email?: string | null;
  profileId?: string | null;
  provider?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (typeof window === "undefined") return;
  const acquisition = getAcquisitionContext() ?? captureAcquisitionContext();
  const body = {
    eventType: input.eventType,
    email: input.email ?? null,
    profileId: input.profileId ?? null,
    provider: input.provider ?? "email",
    acquisition,
    metadata: input.metadata ?? {},
  };
  try {
    const payload = JSON.stringify(body);
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/auth/events", blob);
      return;
    }
  } catch {
    // fall through to fetch
  }
  void fetch("/api/auth/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}
