/**
 * Opt-in remote persistence for local FM turn traces (observability only).
 */

export function isLocalTurnTracePersistEnabled(): boolean {
  if (typeof process !== "undefined") {
    const flag = process.env.NEXT_PUBLIC_LOCAL_TURN_TRACE_PERSIST;
    if (flag === "0" || flag === "false") return false;
    if (flag === "1" || flag === "true") return true;
  }
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:local-turn-trace-persist");
      if (ls === "0") return false;
      if (ls === "1") return true;
    } catch {
      /* ignore */
    }
  }
  // Default on — local FM turns are not persisted to ai_chat_turns today.
  return true;
}
