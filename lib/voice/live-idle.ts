/**
 * Pure helpers for Live idle timeout (no browser deps — safe for node:test).
 */

import type { VoiceLiveStatus } from "./voice-status.ts";

/** True-idle window before Live tears down. */
export const LIVE_IDLE_TIMEOUT_MS = 60_000;

export function isLiveSessionBusyForIdle(opts: {
  speaking: boolean;
  status: VoiceLiveStatus;
  inFlightDelegations: number;
}): boolean {
  return (
    opts.speaking ||
    opts.status === "connecting" ||
    opts.status === "thinking" ||
    opts.status === "searching" ||
    opts.status === "speaking" ||
    opts.inFlightDelegations > 0
  );
}
