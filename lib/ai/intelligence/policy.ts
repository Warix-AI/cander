/**
 * Untrusted-content policy helpers (pure — safe for node:test).
 */

export type CapabilityCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Untrusted content (repos, web, MCP) must never become instructions. */
export function assertTrustedPolicyAction(opts: {
  action: "side_effect" | "read_summarize";
  source: "user" | "tool_result" | "web" | "repo" | "mcp";
}): CapabilityCheckResult {
  if (
    opts.action === "side_effect" &&
    (opts.source === "tool_result" ||
      opts.source === "web" ||
      opts.source === "repo" ||
      opts.source === "mcp")
  ) {
    return {
      ok: false,
      reason:
        "Untrusted content cannot authorize side effects. Confirm with the user first.",
    };
  }
  return { ok: true };
}
