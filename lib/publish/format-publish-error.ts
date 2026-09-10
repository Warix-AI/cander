/**
 * Format publish outcomes for the Publish sheet.
 * Only user-safe copy from `lib/build/publish/user-copy` reaches this point;
 * anything else (legacy / unexpected text) collapses to the generic retry copy
 * so provider, git or build details never render in the UI.
 */

import {
  PUBLISH_STATE_COPY,
  publishUserStateFromError,
} from "@/lib/build/publish/user-copy";

export function formatPublishUserError(raw: string): {
  title: string;
  body: string;
  draftNeedsRepair: boolean;
} {
  const text = (raw || "").trim();
  if (text === PUBLISH_STATE_COPY.needs_fix) {
    return { title: "Your draft needs a fix", body: text, draftNeedsRepair: true };
  }
  if (text === PUBLISH_STATE_COPY.busy) {
    return { title: "Almost there", body: text, draftNeedsRepair: false };
  }
  if (text === PUBLISH_STATE_COPY.needs_retry || !text) {
    return {
      title: "Publish didn’t finish",
      body: PUBLISH_STATE_COPY.needs_retry,
      draftNeedsRepair: false,
    };
  }
  // Legacy / unexpected raw text: classify, then show only the safe copy.
  const state = publishUserStateFromError(text);
  const draftNeedsRepair = state === "needs_fix";
  return {
    title: draftNeedsRepair ? "Your draft needs a fix" : "Publish didn’t finish",
    body: PUBLISH_STATE_COPY[state],
    draftNeedsRepair,
  };
}
