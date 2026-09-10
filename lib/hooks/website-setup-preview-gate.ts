/**
 * Pure helpers for website setup → draft preview gating.
 */

export type WebsiteSetupStatus = "setup" | "building" | "ready" | "failed";

export type WebsiteSetupGateInput = {
  isSite: boolean;
  status?: WebsiteSetupStatus | null;
  draftRunnable?: boolean | null;
};

export type WebsiteSetupGate = {
  /** Ready + runnable: live iframe allowed. */
  isPreviewReady: boolean;
  /** Setup questions / building — skip panel sandbox ensure. */
  setupBlocksPreview: boolean;
  /** Show progress overlay (includes failed). */
  showSetupOverlay: boolean;
  /** Failed preview — keep draft URL + Retry. */
  setupFailed: boolean;
};

export function websiteSetupPreviewGate(
  input: WebsiteSetupGateInput,
): WebsiteSetupGate {
  if (!input.isSite) {
    return {
      isPreviewReady: true,
      setupBlocksPreview: false,
      showSetupOverlay: false,
      setupFailed: false,
    };
  }
  const status = input.status ?? null;
  const setupFailed = status === "failed";
  const isPreviewReady =
    status === "ready" && input.draftRunnable === true;
  return {
    isPreviewReady,
    setupFailed,
    // Failed must not block chrome/ensure the way incomplete setup does.
    setupBlocksPreview: !isPreviewReady && !setupFailed,
    showSetupOverlay: !isPreviewReady,
  };
}
