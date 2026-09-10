/**
 * Pure helpers for website setup → draft preview gating.
 */

export type WebsiteSetupStatus = "setup" | "building" | "ready" | "failed";

export type WebsiteSetupGateInput = {
  isSite: boolean;
  status?: WebsiteSetupStatus | null;
  draftRunnable?: boolean | null;
  /**
   * True while the brief fetch has not returned yet. A missing status must not
   * be treated as "still in guided setup" — that flashes "Answer the questions
   * in chat" and blocks the sandbox when reopening an already-built site.
   */
  briefPending?: boolean;
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
  // Waiting on the brief: let the draft sandbox boot; show neither the setup
  // card nor the "answer questions" overlay.
  if (input.briefPending || input.status == null) {
    return {
      isPreviewReady: false,
      setupBlocksPreview: false,
      showSetupOverlay: false,
      setupFailed: false,
    };
  }
  const status = input.status;
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
