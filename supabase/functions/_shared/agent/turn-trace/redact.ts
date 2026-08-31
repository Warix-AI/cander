const SENSITIVE_KEY =
  /^(authorization|cookie|token|secret|password|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer|session|credential|private[_-]?key|x-api-key)$/i;

const BEARER_RE = /\bbearer\s+[a-z0-9._-]{8,}\b/gi;
const JWT_RE = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;
const SK_RE = /\bsk_[a-zA-Z0-9]{16,}\b/g;

const MAX_STRING = 24_000;
const MAX_ARRAY = 80;
const MAX_DEPTH = 12;

export function redactTraceString(value: string): string {
  return value
    .replace(BEARER_RE, "Bearer [REDACTED]")
    .replace(JWT_RE, "[REDACTED_JWT]")
    .replace(SK_RE, "sk_[REDACTED]")
    .slice(0, MAX_STRING);
}

export function redactTraceValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return "[TRUNCATED_DEPTH]";
  if (typeof value === "string") return redactTraceString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_ARRAY).map((v) => redactTraceValue(v, depth + 1));
    if (value.length > MAX_ARRAY) slice.push(`[+${value.length - MAX_ARRAY} more]`);
    return slice;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redactTraceValue(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 500);
}

export function redactToolPayload(data: unknown): unknown {
  if (!data || typeof data !== "object") return redactTraceValue(data);
  const obj = data as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "images" || k === "image" || k === "bytes" || k === "content_base64") {
      next[k] = "[REDACTED_BINARY]";
    } else {
      next[k] = redactTraceValue(v);
    }
  }
  return next;
}
