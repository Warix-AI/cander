/**
 * Feature flags for Cander Intelligence.
 * PCC/sandbox stay off until entitlement / adapter are ready.
 */

export type IntelligenceFlags = {
  pccEnabled: boolean;
  cloudWorkEnabled: boolean;
  sandboxEnabled: boolean;
};

const DEFAULTS: IntelligenceFlags = {
  pccEnabled: false,
  cloudWorkEnabled: true,
  sandboxEnabled: false,
};

let override: Partial<IntelligenceFlags> | null = null;

export function getIntelligenceFlags(): IntelligenceFlags {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("cander-intelligence-flags");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<IntelligenceFlags>;
        return {
          ...DEFAULTS,
          ...parsed,
          ...override,
        };
      }
    } catch {
      // ignore
    }
  }
  return { ...DEFAULTS, ...override };
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
