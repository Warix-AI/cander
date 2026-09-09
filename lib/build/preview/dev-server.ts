/**
 * Start / wait for the app dev server inside a build sandbox.
 * Server-only.
 */

import { BUILD_APP_PORT } from "@/lib/build/sandbox/constants";
import { runPrivilegedSandboxCommand } from "@/lib/build/sandbox/privileged";

async function portResponds(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const result = await runPrivilegedSandboxCommand({
    sessionId,
    userId,
    cmd: "sh",
    args: [
      "-c",
      // Only treat real app responses as ready — connection failures print 000.
      `code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:${BUILD_APP_PORT}/ 2>/dev/null || echo 000); echo "$code"`,
    ],
  });
  const code = (result.stdout || "").trim().split(/\s+/).pop() || "";
  // Next may return 200/404/500 while booting routes — any HTTP code means the port is open.
  return /^[1-5]\d\d$/.test(code);
}

/**
 * Ensure `npm run dev` (or next) is listening on BUILD_APP_PORT.
 */
export async function ensureSandboxDevServer(opts: {
  sessionId: string;
  userId: string;
}): Promise<{ started: boolean; ready: boolean; message?: string }> {
  try {
    if (await portResponds(opts.sessionId, opts.userId)) {
      return { started: false, ready: true, message: "Dev server already up" };
    }
  } catch {
    /* continue to start */
  }

  const probe = await runPrivilegedSandboxCommand({
    sessionId: opts.sessionId,
    userId: opts.userId,
    cmd: "sh",
    args: [
      "-c",
      `if [ -f package.json ]; then node -e "const p=require('./package.json'); console.log((p.scripts&&(p.scripts.dev||p.scripts.start))||'')"; else echo ''; fi`,
    ],
  });
  const script = (probe.stdout || "").trim();
  if (!script) {
    return {
      started: false,
      ready: false,
      message:
        "No package.json yet — preview stays blank until the draft is written.",
    };
  }

  // Prefer detached runCommand so the process outlives this request.
  try {
    const { resolveSandboxForSession } = await import(
      "@/lib/computer/session-runtime"
    );
    const resolved = await resolveSandboxForSession(
      opts.sessionId,
      opts.userId,
    );
    if (resolved) {
      await resolved.sandbox.runCommand({
        cmd: "sh",
        args: [
          "-c",
          `cd "$(pwd)"
npm install --no-fund --no-audit >/tmp/cander-npm-install.log 2>&1 || true
if npm run 2>/dev/null | grep -q " dev"; then
  exec npm run dev -- --hostname 0.0.0.0 --port ${BUILD_APP_PORT}
fi
if npm run 2>/dev/null | grep -q " start"; then
  exec npm run start -- --hostname 0.0.0.0 --port ${BUILD_APP_PORT}
fi
exec npx --yes next dev --hostname 0.0.0.0 --port ${BUILD_APP_PORT}`,
        ],
        detached: true,
      });
    } else {
      await runPrivilegedSandboxCommand({
        sessionId: opts.sessionId,
        userId: opts.userId,
        cmd: "sh",
        args: [
          "-c",
          `(npm install --no-fund --no-audit >/tmp/cander-npm-install.log 2>&1 || true); ` +
            `(npm run dev -- --hostname 0.0.0.0 --port ${BUILD_APP_PORT} >/tmp/cander-dev-server.log 2>&1 &) ; true`,
        ],
      });
    }
  } catch (err) {
    console.warn("[cander] detached dev server start", err);
    try {
      await runPrivilegedSandboxCommand({
        sessionId: opts.sessionId,
        userId: opts.userId,
        cmd: "sh",
        args: [
          "-c",
          `(npm install --no-fund --no-audit >/tmp/cander-npm-install.log 2>&1 || true); ` +
            `(npm run dev -- --hostname 0.0.0.0 --port ${BUILD_APP_PORT} >/tmp/cander-dev-server.log 2>&1 &) ; true`,
        ],
      });
    } catch (fallbackErr) {
      console.warn("[cander] background dev server fallback", fallbackErr);
    }
  }

  // npm install + Next boot can take a few minutes on a cold sandbox.
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      if (await portResponds(opts.sessionId, opts.userId)) {
        return { started: true, ready: true, message: "Dev server ready" };
      }
    } catch {
      /* retry */
    }
  }

  let hint = "";
  try {
    const log = await runPrivilegedSandboxCommand({
      sessionId: opts.sessionId,
      userId: opts.userId,
      cmd: "sh",
      args: [
        "-c",
        `tail -n 40 /tmp/cander-dev-server.log 2>/dev/null || tail -n 40 /tmp/cander-npm-install.log 2>/dev/null || true`,
      ],
    });
    hint = (log.stdout || "").trim().slice(0, 400);
  } catch {
    /* ignore */
  }

  return {
    started: true,
    ready: false,
    message: hint
      ? `Preview is still starting. ${hint}`
      : "Preview is still starting — Retry in a moment if it stays blank.",
  };
}
