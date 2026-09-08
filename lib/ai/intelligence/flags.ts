/**
 * Feature flags for Cander Intelligence.
 * PCC stays off until entitlement / adapter are ready.
 * Build sandbox can be enabled via env without localStorage.
 */

export type IntelligenceFlags = {
  pccEnabled: boolean;
  cloudWorkEnabled: boolean;
  sandboxEnabled: boolean;
};

function envSandboxEnabled(): boolean {
  const v =
    process.env.NEXT_PUBLIC_CANDER_BUILD_SANDBOX?.trim().toLowerCase() ||
    process.env.CANDER_BUILD_SANDBOX?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

const DEFAULTS: IntelligenceFlags = {
  pccEnabled: false,
  cloudWorkEnabled: true,
  sandboxEnabled: false,
};

let override: Partial<IntelligenceFlags> | null = null;

export function getIntelligenceFlags(): IntelligenceFlags {
  const fromEnv = envSandboxEnabled();
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("cander-intelligence-flags");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<IntelligenceFlags>;
        return {
          ...DEFAULTS,
          sandboxEnabled: fromEnv || Boolean(parsed.sandboxEnabled),
          ...parsed,
          // env wins for sandbox when set
          ...(fromEnv ? { sandboxEnabled: true } : {}),
          ...override,
        };
      }
    } catch {
      // ignore
    }
  }
  return {
    ...DEFAULTS,
    sandboxEnabled: fromEnv || DEFAULTS.sandboxEnabled,
    ...override,
  };
}

/** Test / server override. */
export function setIntelligenceFlagsForTests(
  next: Partial<IntelligenceFlags> | null,
) {
  override = next;
}

export function isPccEnabled() {
  return getIntelligenceFlags().pccEnabled;
}

export function isCloudWorkEnabled() {
  return getIntelligenceFlags().cloudWorkEnabled;
}

export function isSandboxEnabled() {
  return getIntelligenceFlags().sandboxEnabled;
}
