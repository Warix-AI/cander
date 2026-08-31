/**
 * Egress policy — minimum payload leaving the device per tool call (v4 §9).
 */

const DEFAULT_MAX_QUERY = 512;
const DEFAULT_MAX_BODY = 2048;

export type EgressPolicyOpts = {
  maxQueryChars?: number;
  maxBodyChars?: number;
  stripInternalKeys?: boolean;
};

const INTERNAL_KEYS = new Set([
  "retrievalTrace",
  "debug",
  "_internal",
  "turnAudit",
  "operationId",
]);

export function applyEgressPolicy(
  args: Record<string, unknown>,
  opts?: EgressPolicyOpts,
): Record<string, unknown> {
  const maxQuery = opts?.maxQueryChars ?? DEFAULT_MAX_QUERY;
  const maxBody = opts?.maxBodyChars ?? DEFAULT_MAX_BODY;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (opts?.stripInternalKeys !== false && INTERNAL_KEYS.has(key)) {
      continue;
    }
    if (key === "query" && typeof value === "string") {
      out[key] = value.trim().slice(0, maxQuery);
      continue;
    }
    if (
      (key === "body" || key === "content" || key === "text") &&
      typeof value === "string"
    ) {
      out[key] = value.slice(0, maxBody);
      continue;
    }
    if (key === "retrievalHints" && value && typeof value === "object") {
      const hints = value as Record<string, unknown>;
      out[key] = {
        subject:
          typeof hints.subject === "string"
            ? hints.subject.slice(0, 120)
            : hints.subject,
        operation: hints.operation,
        requestedFields: Array.isArray(hints.requestedFields)
          ? hints.requestedFields.slice(0, 8)
          : hints.requestedFields,
      };
      continue;
    }
    out[key] = value;
  }

  return out;
}
