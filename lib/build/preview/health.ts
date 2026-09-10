/**
 * Detect broken Next.js draft previews (HTTP 5xx / __next_error) vs healthy HTML.
 */

export type PreviewHealthResult = {
  ok: boolean;
  status: number | null;
  reason: string | null;
  /** Sanitized install / Next snippet for operators and chat recovery copy. */
  diagnostics?: string | null;
};

/** Strip secrets / overlong noise from sandbox log snippets. */
export function sanitizePreviewDiagnostics(
  raw: string | null | undefined,
  max = 480,
): string | null {
  if (!raw?.trim()) return null;
  let out = raw
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/ghp_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/sk-[A-Za-z0-9]+/g, "[redacted]")
    .replace(/SUPABASE_SERVICE_ROLE_KEY=\S+/gi, "SUPABASE_SERVICE_ROLE_KEY=[redacted]")
    .replace(/\x1b\[[0-9;]*m/g, "");
  out = out.trim().replace(/\n{3,}/g, "\n\n");
  if (out.length > max) out = `${out.slice(0, max - 1)}…`;
  return out || null;
}

export function assessPreviewHealth(opts: {
  status: number | null;
  bodyText?: string | null;
  diagnostics?: string | null;
}): PreviewHealthResult {
  const status = opts.status;
  const body = opts.bodyText || "";
  const diagnostics = sanitizePreviewDiagnostics(opts.diagnostics);

  if (status == null || status === 0) {
    return {
      ok: false,
      status,
      reason: "Draft preview did not respond (connection failed).",
      diagnostics,
    };
  }

  if (status >= 500) {
    return {
      ok: false,
      status,
      reason: `Draft failed to start (HTTP ${status}).`,
      diagnostics,
    };
  }

  const lower = body.toLowerCase();
  if (
    lower.includes("__next_error") ||
    lower.includes("application error: a client-side exception") ||
    /data-next-error|nextjs.*error/i.test(body)
  ) {
    const snippet = sanitizePreviewDiagnostics(body.slice(0, 600));
    return {
      ok: false,
      status,
      reason:
        "Draft failed to start (Next.js runtime error). Check for duplicate route files or a broken app/page.",
      diagnostics: diagnostics || snippet,
    };
  }

  if (status >= 400) {
    return {
      ok: false,
      status,
      reason: `Draft preview returned HTTP ${status}.`,
      diagnostics,
    };
  }

  return { ok: true, status, reason: null, diagnostics: null };
}

export function formatDraftFailedMessage(reason: string): string {
  return `Draft failed to start: ${reason}`;
}

/** Port is accepting HTTP (listening). 5xx means listening but unhealthy. */
export function isHttpPortOpen(status: number | null): boolean {
  return status != null && status >= 100 && status < 600;
}

/** Application-ready responses for draft preview. */
export function isHealthyPreviewStatus(status: number | null): boolean {
  return status != null && status >= 200 && status < 400;
}
