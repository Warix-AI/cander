/**
 * Start / wait for the app dev server inside a build sandbox.
 * Server-only.
 */

import { BUILD_APP_PORT } from "@/lib/build/sandbox/constants";
import { runPrivilegedSandboxCommand } from "@/lib/build/sandbox/privileged";
import {
  isHealthyPreviewStatus,
  isHttpPortOpen,
  sanitizePreviewDiagnostics,
} from "@/lib/build/preview/health";

async function probePort(
  sessionId: string,
  userId: string,
): Promise<{ status: number; open: boolean; healthy: boolean }> {
  const result = await runPrivilegedSandboxCommand({
    sessionId,
    userId,
    cmd: "sh",
    args: [
      "-c",
      `code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:${BUILD_APP_PORT}/ 2>/dev/null || echo 000); echo "$code"`,
    ],
  });
  const code = (result.stdout || "").trim().split(/\s+/).pop() || "";
  const status = /^\d{3}$/.test(code) ? Number(code) : 0;
  return {
    status,
    open: isHttpPortOpen(status),
    healthy: isHealthyPreviewStatus(status),
  };
}

async function readInstallLog(
  sessionId: string,
  userId: string,
): Promise<string | null> {
  try {
    const log = await runPrivilegedSandboxCommand({
      sessionId,
      userId,
      cmd: "sh",
      args: [
        "-c",
        `tail -n 60 /tmp/cander-npm-install.log 2>/dev/null || true`,
      ],
    });
    return sanitizePreviewDiagnostics(log.stdout);
  } catch {
    return null;
  }
}

/**
 * Ensure `npm run dev` (or next) is listening with a healthy HTTP response.
 * Does not treat HTTP 500 as ready. Fails closed when npm install fails.
 */
export async function ensureSandboxDevServer(opts: {
  sessionId: string;
  userId: string;
}): Promise<{
  started: boolean;
  ready: boolean;
  message?: string;
  diagnostics?: string | null;
  httpStatus?: number | null;
}> {
  try {
    const probe = await probePort(opts.sessionId, opts.userId);
    if (probe.healthy) {
      return {
        started: false,
        ready: true,
        message: "Dev server already up",
        httpStatus: probe.status,
      };
    }
  } catch {
    /* continue to start */
  }

  const scriptProbe = await runPrivilegedSandboxCommand({
    sessionId: opts.sessionId,
    userId: opts.userId,
    cmd: "sh",
    args: [
      "-c",
      `if [ -f package.json ]; then node -e "const p=require('./package.json'); console.log((p.scripts&&(p.scripts.dev||p.scripts.start))||'')"; else echo ''; fi`,
    ],
  });
  const script = (scriptProbe.stdout || "").trim();
  if (!script) {
    return {
      started: false,
      ready: false,
      message:
        "No package.json yet — preview stays blank until the draft is written.",
    };
  }

  // Install must succeed — do not swallow failures with || true.
  const install = await runPrivilegedSandboxCommand({
    sessionId: opts.sessionId,
    userId: opts.userId,
    cmd: "sh",
    args: [
      "-c",
      // Warm (persistent) VMs already have node_modules: prefer the local cache
      // so a resumed session is back in seconds instead of a full install.
      `if [ -d node_modules ]; then npm install --no-fund --no-audit --prefer-offline > /tmp/cander-npm-install.log 2>&1; else npm install --no-fund --no-audit > /tmp/cander-npm-install.log 2>&1; fi; echo "__CANDER_NPM_EXIT:$?"`,
    ],
  });
  const installOut = install.stdout || "";
  const exitMatch = installOut.match(/__CANDER_NPM_EXIT:(\d+)/);
  const installExit = exitMatch ? Number(exitMatch[1]) : 1;
  if (installExit !== 0) {
    const diagnostics = await readInstallLog(opts.sessionId, opts.userId);
    return {
      started: false,
      ready: false,
      message: "npm install failed — draft preview cannot start.",
      diagnostics,
      httpStatus: null,
    };
  }

  const startCmd = `(npm run 2>/dev/null | grep -q " dev" && exec npm run dev -- --hostname 0.0.0.0 --port ${BUILD_APP_PORT}); (npm run 2>/dev/null | grep -q " start" && exec npm run start -- --hostname 0.0.0.0 --port ${BUILD_APP_PORT}); exec npx --yes next dev --hostname 0.0.0.0 --port ${BUILD_APP_PORT}`;

  try {
    const { resolveSandboxForSession } = await import(
      "@/lib/computer/session-runtime"
    );
    const resolved = await resolveSandboxForSession(
      opts.sessionId,
      opts.userId,
    );
    if (resolved) {
      // Always log: when the server later dies (config change, OOM, crash)
      // the builder's preview supervisor and finalize diagnostics read this.
      await resolved.sandbox.runCommand({
        cmd: "sh",
        args: [
          "-c",
          `cd "$(pwd)"; rm -f .next/dev/lock .next/lock 2>/dev/null; (${startCmd}) >/tmp/cander-dev-server.log 2>&1`,
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
          `(${startCmd}) >/tmp/cander-dev-server.log 2>&1 &`,
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
          `(${startCmd}) >/tmp/cander-dev-server.log 2>&1 &`,
        ],
      });
    } catch (fallbackErr) {
      console.warn("[cander] background dev server fallback", fallbackErr);
    }
  }

  // Wait for a healthy (2xx/3xx) response — not merely an open port with 500.
  let lastStatus: number | null = null;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const probe = await probePort(opts.sessionId, opts.userId);
      lastStatus = probe.status;
      if (probe.healthy) {
        return {
          started: true,
          ready: true,
          message: "Dev server ready",
          httpStatus: probe.status,
        };
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
        `tail -n 40 /tmp/cander-dev-server.log 2>/dev/null; echo '---'; tail -n 40 /tmp/cander-npm-install.log 2>/dev/null || true`,
      ],
    });
    hint = sanitizePreviewDiagnostics(log.stdout) || "";
  } catch {
    /* ignore */
  }

  return {
    started: true,
    ready: false,
    message: hint
      ? `Preview is still starting or unhealthy (last HTTP ${lastStatus ?? "n/a"}).`
      : "Preview is still starting — Retry in a moment if it stays blank.",
    diagnostics: hint || null,
    httpStatus: lastStatus,
  };
}
