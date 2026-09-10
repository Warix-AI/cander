/**
 * Server-side draft preview health check (Phase 3 preview_check).
 * Runs curl inside the project sandbox and assesses with assessPreviewHealth.
 */

import { BUILD_APP_PORT } from "@/lib/build/sandbox/constants";
import { runPrivilegedSandboxCommand } from "@/lib/build/sandbox/privileged";
import {
  assessPreviewHealth,
  type PreviewHealthResult,
} from "@/lib/build/preview/health";

export async function runSandboxPreviewCheck(opts: {
  sessionId: string;
  userId: string;
  /** Max poll attempts (default ~90s). */
  attempts?: number;
  intervalMs?: number;
}): Promise<PreviewHealthResult & { attempts: number }> {
  const attempts = opts.attempts ?? 30;
  const intervalMs = opts.intervalMs ?? 3000;
  let last: PreviewHealthResult = {
    ok: false,
    status: null,
    reason: "Preview check did not run.",
  };

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
    last = assessPreviewHealth({ status, bodyText: body });
    if (last.ok) {
      return { ...last, attempts: i + 1 };
    }
    // Hard fail on Next runtime error / 5xx once the server is up.
    if (
      last.status &&
      last.status >= 400 &&
      last.reason &&
      /Next\.js runtime|HTTP 5\d\d|HTTP 4\d\d/.test(last.reason)
    ) {
      // Give cold boots a few more tries on 000/connection only.
      if (last.status >= 400) {
        // Keep polling briefly for 404 during boot; fail fast on 5xx / next_error.
        if (last.status >= 500 || /Next\.js runtime/i.test(last.reason)) {
          return { ...last, attempts: i + 1 };
        }
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ...last, attempts };
}
