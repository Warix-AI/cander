/**
 * Detect broken Next.js draft previews (HTTP 5xx / __next_error) vs healthy HTML.
 */

export type PreviewHealthResult = {
  ok: boolean;
  status: number | null;
  reason: string | null;
};

export function assessPreviewHealth(opts: {
  status: number | null;
  bodyText?: string | null;
}): PreviewHealthResult {
  const status = opts.status;
  const body = opts.bodyText || "";

  if (status == null || status === 0) {
    return {
      ok: false,
      status,
      reason: "Draft preview did not respond (connection failed).",
    };
  }

  if (status >= 500) {
    return {
      ok: false,
      status,
      reason: `Draft failed to start (HTTP ${status}).`,
    };
  }

  const lower = body.toLowerCase();
  if (
    lower.includes("__next_error") ||
    lower.includes("application error: a client-side exception") ||
    /data-next-error|nextjs.*error/i.test(body)
  ) {
    return {
      ok: false,
      status,
      reason:
        "Draft failed to start (Next.js runtime error). Check for duplicate route files or a broken app/page.",
    };
  }

  if (status >= 400) {
    return {
      ok: false,
      status,
      reason: `Draft preview returned HTTP ${status}.`,
    };
  }

  return { ok: true, status, reason: null };
}

export function formatDraftFailedMessage(reason: string): string {
  return `Draft failed to start: ${reason}`;
}
