/**
 * Legacy localStorage keys migrated to Supabase on first authenticated session.
 * Entity/policy/connector keys remain as offline cache after import — only auth
 * flags and duplicate import payloads are removed.
 */

export const LEGACY_AUTH_KEYS = [
  "courier-signed-in",
  "courier-actor",
] as const;

/** Raw payloads imported once; safe to drop after all import flags are set. */
export const LEGACY_IMPORT_PAYLOAD_KEYS = [
  "courier-space-entities-v1",
  "courier-threads-v1",
  "courier-work-connectors",
  "courier-installed-connectors",
  "courier-workspace-connections",
  "courier-workspace-policies",
  "courier-org-members",
  "courier-org-members-v",
  "courier-pins",
  "courier-sidebar",
] as const;

export const IMPORT_FLAG_KEYS = [
  "courier-entities-imported-v1",
  "courier-chat-imported-v1",
  "courier-org-policy-imported-v1",
  "courier-user-prefs-imported-v1",
  "courier-connectors-imported-v1",
  "courier-browser-imported-v1",
] as const;

export const LEGACY_CLEARED_FLAG = "courier-legacy-cleared-v1";

export function allSupabaseImportsComplete(): boolean {
  if (typeof window === "undefined") return false;
  return IMPORT_FLAG_KEYS.every(
    (key) => window.localStorage.getItem(key) === "1",
  );
}

/** Remove deprecated auth flags and one-time import payloads. */
export function clearLegacyStorageAfterImport() {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem(LEGACY_CLEARED_FLAG) === "1") return false;
  if (!allSupabaseImportsComplete()) return false;

  for (const key of LEGACY_AUTH_KEYS) {
    window.localStorage.removeItem(key);
  }
  for (const key of LEGACY_IMPORT_PAYLOAD_KEYS) {
    window.localStorage.removeItem(key);
  }

  window.localStorage.setItem(LEGACY_CLEARED_FLAG, "1");
  return true;
}

export function scanLegacyStorage() {
  if (typeof window === "undefined") {
    return {
      importsComplete: false,
      legacyCleared: false,
      pendingImportFlags: [...IMPORT_FLAG_KEYS],
      remainingPayloadKeys: [] as string[],
      remainingAuthKeys: [] as string[],
    };
  }

  const pendingImportFlags = IMPORT_FLAG_KEYS.filter(
    (key) => window.localStorage.getItem(key) !== "1",
  );
  const remainingPayloadKeys = LEGACY_IMPORT_PAYLOAD_KEYS.filter((key) =>
    window.localStorage.getItem(key),
  );
  const remainingAuthKeys = LEGACY_AUTH_KEYS.filter((key) =>
    window.localStorage.getItem(key),
  );

  return {
    importsComplete: pendingImportFlags.length === 0,
    legacyCleared: window.localStorage.getItem(LEGACY_CLEARED_FLAG) === "1",
    pendingImportFlags,
    remainingPayloadKeys,
    remainingAuthKeys,
  };
}
