/**
 * Live voice sidebar/status labels — mirrors chat activity wording.
 */

export type VoiceLiveStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "searching"
  | "speaking";

export function voiceStatusLabel(status: VoiceLiveStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting…";
    case "listening":
      return "Listening";
    case "thinking":
      return "Thinking…";
    case "searching":
      return "Searching…";
    case "speaking":
      return "Speaking";
    case "idle":
    default:
      return "Voice";
  }
}

/** Prefer Searching… when the user ask looks retrieval-shaped. */
export function delegationStatusForRequest(requestText: string): VoiceLiveStatus {
  const t = requestText.trim().toLowerCase();
  if (
    /\b(search|look up|lookup|find|fetch|google|web|latest|current|today|tomorrow|news|weather|score|schedule)\b/.test(
      t,
    )
  ) {
    return "searching";
  }
  return "thinking";
}
