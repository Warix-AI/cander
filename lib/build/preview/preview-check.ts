/**
 * Server-side draft preview health check (Phase 3 preview_check).
 * Bounded polling with grace for transient 5xx during cold compile.
 */

import { BUILD_APP_PORT } from "@/lib/build/sandbox/constants";
import { runPrivilegedSandboxCommand } from "@/lib/build/sandbox/privileged";
import {
  assessPreviewHealth,
  sanitizePreviewDiagnostics,
  type PreviewHealthResult,
} from "@/lib/build/preview/health";
import { nextUnhealthyStreakState } from "@/lib/build/preview/unhealthy-streak";

async function collectDiagnostics(
  sessionId: string,
  userId: string,
  bodyText: string,
): Promise<string | null> {
  let install = "";
  try {
    const log = await runPrivilegedSandboxCommand({
      sessionId,
      userId,
      cmd: "sh",
      args: [
        "-c",
        `tail -n 40 /tmp/cander-npm-install.log 2>/dev/null; echo '---'; tail -n 40 /tmp/cander-dev-server.log 2>/dev/null || true`,
      ],
    });
    install = log.stdout || "";
  } catch {
    /* ignore */
  }
  return sanitizePreviewDiagnostics(
    [install, bodyText.slice(0, 800)].filter(Boolean).join("\n"),
  );
}

export async function runSandboxPreviewCheck(opts: {
  sessionId: string;
  userId: string;
  /** Max poll attempts (default ~90s). */
  attempts?: number;
  intervalMs?: number;
  /**
   * How many consecutive unhealthy 5xx / next_error probes before fail.
   * Transient compile 500s often clear within a few attempts.
   */
  consecutiveUnhealthyLimit?: number;
  /** Attempts that tolerate 5xx without counting toward the fail limit. */
  graceAttempts?: number;
}): Promise<PreviewHealthResult & { attempts: number }> {
  const attempts = opts.attempts ?? 30;
  const intervalMs = opts.intervalMs ?? 3000;
  const consecutiveUnhealthyLimit = opts.consecutiveUnhealthyLimit ?? 3;
  const graceAttempts = opts.graceAttempts ?? 8;
  let last: PreviewHealthResult = {
    ok: false,
    status: null,
    reason: "Preview check did not run.",
  };
  let consecutiveUnhealthy = 0;

  for (let i = 0; i < attempts; i++) {
    const probe = await runPrivilegedSandboxCommand({
      sessionId: opts.sessionId,
      userId: opts.userId,
      cmd: "sh",
      args: [
        "-c",
        [
          `code=$(curl -sS -o /tmp/cander_preview_check.html -w "%{http_code}" --max-time 5 http://127.0.0.1:${BUILD_APP_PORT}/ 2>/dev/null || echo 000)`,
          `body=$(head -c 12000 /tmp/cander_preview_check.html 2>/dev/null || true)`,
          `printf '%s\\n' "$code"`,
          `printf '%s' "$body"`,
        ].join("; "),
      ],
    });
    const out = probe.stdout || "";
    const nl = out.indexOf("\n");
    const codeStr = (nl >= 0 ? out.slice(0, nl) : out).trim();
    const body = nl >= 0 ? out.slice(nl + 1) : "";
    const status = /^\d{3}$/.test(codeStr) ? Number(codeStr) : 0;
    const diagnostics = await collectDiagnostics(
      opts.sessionId,
      opts.userId,
      body,
    );
    last = assessPreviewHealth({ status, bodyText: body, diagnostics });
    if (last.ok) {
      return { ...last, attempts: i + 1 };
    }

    const hardUnhealthy =
      (last.status != null && last.status >= 500) ||
      /Next\.js runtime/i.test(last.reason || "");
    const streak = nextUnhealthyStreakState({
      attemptIndex: i,
      hardUnhealthy,
      consecutiveUnhealthy,
      graceAttempts,
      consecutiveUnhealthyLimit,
    });
    consecutiveUnhealthy = streak.consecutiveUnhealthy;
    if (streak.shouldFail) {
      return { ...last, attempts: i + 1 };
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ...last, attempts };
}
