// Preview supervisor — owns "is the dev server reachable?" for the builder.
//
// The coding agent must never be asked to fix routes when the whole app is
// unreachable. Before any route-level check, callers go through `ensure()`:
//
//   probe → (down) → diagnose → recover (install deps / restart server /
//   wait for compile) → probe again
//
// Every outcome is classified so the caller can tell an application failure
// (compile error the coder should fix) from an infrastructure failure (the
// server cannot be started here at all — hand the draft to Cander's server,
// which has stronger repair tools: reinstall, recreate VM).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execShell, truncate } from "./tools.mjs";

/** Log files every dev-server start path writes to (server + builder + agent). */
export const DEV_SERVER_LOGS = ["/tmp/cander-dev-server.log", "/tmp/cander-dev.log"];
const INSTALL_LOG = "/tmp/cander-npm-install.log";

/**
 * @typedef {"up"|"down"} ProbeState
 * @typedef {{
 *   state: ProbeState,
 *   status: number,
 *   ms: number,
 *   error?: string|null,
 * }} Probe
 *
 * @typedef {"healthy"|"not_running"|"compile_error"|"runtime_crash"|"config_restart"|"missing_deps"|"install_failed"|"port_conflict"|"port_bound_no_response"|"unknown"} PreviewCause
 *
 * @typedef {{
 *   cause: PreviewCause,
 *   /** "app" = code the coder can fix; "infra" = environment / runtime; "none" = healthy *\/
 *   kind: "app"|"infra"|"none",
 *   listening: boolean,
 *   processes: string,
 *   logTail: string,
 *   detail: string,
 * }} Diagnosis
 *
 * @typedef {{
 *   ok: boolean,
 *   kind: "none"|"app"|"infra",
 *   cause: PreviewCause,
 *   detail: string,
 *   attempts: number,
 *   recovered: boolean,
 *   status: number,
 * }} EnsureResult
 */

const COMPILE_RE =
  /Failed to compile|Module not found|Syntax ?Error|Unexpected token|Cannot find module '(?!next|react)|Parsing (ecmascript|css) source code failed|error TS\d+|Build Error|Turbopack build failed|Unhandled Runtime Error|ReferenceError|TypeError:.*is not a function/i;
const CONFIG_RESTART_RE =
  /Found a change in next\.config|Restarting the server to apply the changes|Please restart the server|next\.config\.(js|mjs|ts) (changed|has changed)/i;
const MISSING_DEPS_RE = /Cannot find module '(next|react|react-dom|tailwindcss|@tailwindcss\/postcss)'|ERR_MODULE_NOT_FOUND|Cannot find package|node_modules.*not found|next: not found|sh: .*next: command not found/i;
const PORT_CONFLICT_RE = /EADDRINUSE|address already in use|Port \d+ is in use/i;
const OOM_RE = /JavaScript heap out of memory|FATAL ERROR: .*Allocation failed|Killed\b|ENOMEM/i;

export class PreviewSupervisor {
  /**
   * @param {{
   *   repoDir: string,
   *   devServerUrl: string,
   *   log: import("./events.mjs").EventLog,
   *   maxRecoveries?: number,
   *   startWaitMs?: number,
   *   installTimeoutMs?: number,
   * }} opts
   */
  constructor(opts) {
    this.repoDir = opts.repoDir;
    this.devServerUrl = opts.devServerUrl.replace(/\/$/, "");
    this.log = opts.log;
    this.port = (() => {
      try {
        return Number(new URL(this.devServerUrl).port) || 3000;
      } catch {
        return 3000;
      }
    })();
    this.maxRecoveries = opts.maxRecoveries ?? 4;
    this.startWaitMs = opts.startWaitMs ?? 150_000;
    this.installTimeoutMs = opts.installTimeoutMs ?? 6 * 60_000;
    /** @type {Array<{ at: string, cause: PreviewCause, action: string, ok: boolean, detail: string }>} */
    this.history = [];
    this.recoveries = 0;
    this.installsRun = 0;
    /** @type {EnsureResult|null} */
    this.last = null;
    this._inflight = null;
  }

  // ---- probe ---------------------------------------------------------------

  /** Any HTTP status (even 404/500) means the server process is listening. */
  async probe(timeoutMs = 20_000) {
    const started = Date.now();
    try {
      const res = await fetch(`${this.devServerUrl}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "text/html" },
      });
      // Drain so the socket is reused.
      await res.arrayBuffer().catch(() => undefined);
      return { state: "up", status: res.status, ms: Date.now() - started, error: null };
    } catch (err) {
      return {
        state: "down",
        status: 0,
        ms: Date.now() - started,
        error: String(err?.message || err),
      };
    }
  }

  // ---- diagnose ------------------------------------------------------------

  /** @returns {Promise<Diagnosis>} */
  async diagnose() {
    const shell = await execShell(
      [
        `echo "__LISTEN__"; (ss -ltn 2>/dev/null || netstat -an 2>/dev/null | grep -i listen || lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null) | grep -E "[:.]${this.port}\\b" || true`,
        `echo "__PS__"; ps -eo pid,etime,rss,args 2>/dev/null | grep -E "next|node .*dev|npm run dev" | grep -v grep | head -n 8 || true`,
        `echo "__NM__"; [ -d node_modules/next ] && echo has_next || echo no_next; [ -d node_modules ] && echo has_nm || echo no_nm`,
        `echo "__INSTALL__"; tail -n 25 ${INSTALL_LOG} 2>/dev/null || true`,
        ...DEV_SERVER_LOGS.map((f) => `echo "__LOG__ ${f}"; tail -n 60 ${f} 2>/dev/null || true`),
      ].join("; "),
      { cwd: this.repoDir, timeoutMs: 20_000 },
    );
    const out = shell.stdout || "";
    const section = (name) => {
      const i = out.indexOf(`__${name}__`);
      if (i < 0) return "";
      const rest = out.slice(i + name.length + 4);
      const j = rest.search(/\n__[A-Z]+__/);
      return (j >= 0 ? rest.slice(0, j) : rest).trim();
    };
    const listening = section("LISTEN").length > 0;
    const processes = section("PS");
    const nm = section("NM");
    const install = section("INSTALL");
    const logTail = out
      .split(/\n(?=__LOG__ )/)
      .filter((s) => s.startsWith("__LOG__"))
      .map((s) => s.replace(/^__LOG__ \S+\n?/, "").trim())
      .filter(Boolean)
      .join("\n---\n");

    const pkgOk = this.packageJsonOk();
    let cause = "unknown";
    let kind = "infra";
    if (!pkgOk.ok) {
      cause = "compile_error";
      kind = "app";
    } else if (/no_nm|no_next/.test(nm)) {
      cause = "missing_deps";
    } else if (/npm ERR!|ERESOLVE|ENOTFOUND|EAI_AGAIN|E404/.test(install) && !/added \d+ packages|up to date/.test(install.slice(-400))) {
      cause = "install_failed";
    } else if (CONFIG_RESTART_RE.test(logTail)) {
      cause = "config_restart";
    } else if (PORT_CONFLICT_RE.test(logTail)) {
      cause = "port_conflict";
    } else if (MISSING_DEPS_RE.test(logTail)) {
      cause = "missing_deps";
    } else if (OOM_RE.test(logTail)) {
      cause = "runtime_crash";
    } else if (COMPILE_RE.test(logTail) && !listening) {
      // The server exited while reporting a build error → the coder must fix
      // the code, but we still restart so it can see the overlay afterwards.
      cause = "compile_error";
      kind = "app";
    } else if (listening) {
      cause = "port_bound_no_response";
    } else {
      cause = processes ? "runtime_crash" : "not_running";
    }

    const errLine =
      logTail.split("\n").reverse().find((l) => COMPILE_RE.test(l) || MISSING_DEPS_RE.test(l) || CONFIG_RESTART_RE.test(l)) ||
      "";
    const detail = [
      !pkgOk.ok ? pkgOk.error : "",
      errLine ? errLine.trim().slice(0, 300) : "",
      !errLine && logTail ? logTail.split("\n").slice(-3).join(" ").slice(0, 300) : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return { cause, kind, listening, processes, logTail, detail };
  }

  packageJsonOk() {
    const p = join(this.repoDir, "package.json");
    if (!existsSync(p)) return { ok: false, error: "package.json is missing" };
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8"));
      const deps = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
      if (!deps.next) return { ok: false, error: "package.json has no `next` dependency" };
      return { ok: true, error: null, scripts: pkg.scripts || {} };
    } catch (err) {
      return { ok: false, error: `package.json is not valid JSON (${err?.message || err})` };
    }
  }

  // ---- recover -------------------------------------------------------------

  async killServer() {
    await execShell(
      [
        `for p in $(ss -ltnp 2>/dev/null | grep -E "[:.]${this.port}\\b" | sed -n 's/.*pid=\\([0-9]*\\).*/\\1/p' | sort -u); do kill "$p" 2>/dev/null || true; done`,
        `for p in $(lsof -ti tcp:${this.port} -sTCP:LISTEN 2>/dev/null); do kill "$p" 2>/dev/null || true; done`,
        "pkill -f 'next dev' 2>/dev/null || true",
        "pkill -f 'next-server' 2>/dev/null || true",
        "pkill -f 'next/dist/bin/next' 2>/dev/null || true",
        "sleep 1",
      ].join("; "),
      { cwd: this.repoDir, timeoutMs: 15_000 },
    );
  }

  async installDeps() {
    this.installsRun += 1;
    this.log.emit("status", "Preparing preview", { phase: "preview_recovery", action: "install" });
    const r = await execShell(
      `npm install --no-fund --no-audit --prefer-offline > ${INSTALL_LOG} 2>&1; echo "__EXIT:$?"`,
      { cwd: this.repoDir, timeoutMs: this.installTimeoutMs },
    );
    const ok = /__EXIT:0/.test(r.stdout || "");
    if (!ok) {
      const tail = await execShell(`tail -n 20 ${INSTALL_LOG} 2>/dev/null`, { cwd: this.repoDir, timeoutMs: 5000 });
      this.log.emit("log", `npm install failed:\n${truncate(tail.stdout, 1200)}`);
    }
    return ok;
  }

  /** Start the dev server the same way Cander's server does, detached, logged. */
  async startServer() {
    const pkg = this.packageJsonOk();
    const scripts = pkg.scripts || {};
    const bin = scripts.dev
      ? `npm run dev -- --hostname 0.0.0.0 --port ${this.port}`
      : scripts.start
        ? `npm run start -- --hostname 0.0.0.0 --port ${this.port}`
        : `npx --no-install next dev --hostname 0.0.0.0 --port ${this.port}`;
    // Stale lock from a crashed process blocks the next start. setsid (Linux)
    // detaches from the builder's session so the server outlives this call.
    await execShell(
      `rm -f .next/dev/lock .next/lock 2>/dev/null; SETSID=$(command -v setsid || true); nohup $SETSID ${bin} > ${DEV_SERVER_LOGS[0]} 2>&1 < /dev/null & echo $!`,
      { cwd: this.repoDir, timeoutMs: 15_000, env: { NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" } },
    );
  }

  /** Poll until the port answers (any status) or time runs out. */
  async waitForServer(maxMs) {
    const started = Date.now();
    let lastLog = started;
    while (Date.now() - started < maxMs) {
      const p = await this.probe(8000);
      if (p.state === "up") return p;
      // Give the event stream a heartbeat so the server-side stall watchdog
      // never mistakes a long compile for a hung builder.
      if (Date.now() - lastLog > 30_000) {
        lastLog = Date.now();
        this.log.emit("progress", "Preparing preview…", { phase: "preview_recovery", waitedMs: Date.now() - started });
      }
      // Bail early if the process died with an error we can read.
      const d = await this.diagnose();
      if (!d.listening && !d.processes && (d.cause === "compile_error" || d.cause === "missing_deps" || d.cause === "config_restart")) {
        return { state: "down", status: 0, ms: Date.now() - started, error: d.detail, diagnosis: d };
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    return { state: "down", status: 0, ms: Date.now() - started, error: "timed out waiting for the preview server" };
  }

  /**
   * One structured recovery pass for a given diagnosis. Returns the probe after
   * recovery plus what was done.
   * @param {Diagnosis} d
   */
  async recoverOnce(d) {
    let action = "restart";
    if (d.cause === "missing_deps" || d.cause === "install_failed") {
      action = "install+restart";
      if (this.installsRun >= 2) {
        return { probe: { state: "down", status: 0, ms: 0 }, action, detail: "dependency install keeps failing" };
      }
      const ok = await this.installDeps();
      if (!ok) return { probe: { state: "down", status: 0, ms: 0 }, action, detail: "npm install failed" };
    }
    if (d.cause === "port_bound_no_response") {
      // Something holds the port but never answers → it is wedged. Kill + restart.
      action = "kill+restart";
    }
    if (d.cause === "compile_error" && d.listening) {
      // Server is up and showing an overlay — nothing to restart.
      return { probe: await this.probe(), action: "none", detail: d.detail };
    }
    this.log.emit("status", "Preparing preview", { phase: "preview_recovery", action, cause: d.cause });
    await this.killServer();
    await this.startServer();
    const probe = await this.waitForServer(this.startWaitMs);
    return { probe, action, detail: probe.error || d.detail };
  }

  /**
   * Make sure the preview answers HTTP before route checks. Bounded by
   * `maxRecoveries` per job; concurrent callers share one attempt.
   * @param {{ reason?: string, allowRecovery?: boolean }} [opts]
   * @returns {Promise<EnsureResult>}
   */
  async ensure(opts = {}) {
    if (this._inflight) return this._inflight;
    this._inflight = this._ensure(opts).finally(() => {
      this._inflight = null;
    });
    return this._inflight;
  }

  async _ensure(opts) {
    const first = await this.probe();
    if (first.state === "up") {
      this.last = { ok: true, kind: "none", cause: "healthy", detail: "", attempts: 0, recovered: false, status: first.status };
      return this.last;
    }
    const allow = opts.allowRecovery !== false;
    let diagnosis = await this.diagnose();
    this.log.emit("log", `Preview unreachable (${diagnosis.cause}): ${diagnosis.detail || first.error || "no HTTP response"}`, {
      phase: "preview_diagnosis",
      cause: diagnosis.cause,
      kind: diagnosis.kind,
      listening: diagnosis.listening,
      reason: opts.reason || null,
    });

    let attempts = 0;
    let recovered = false;
    let probe = first;
    while (allow && this.recoveries < this.maxRecoveries) {
      this.recoveries += 1;
      attempts += 1;
      const r = await this.recoverOnce(diagnosis);
      probe = r.probe;
      const ok = probe.state === "up";
      this.history.push({
        at: new Date().toISOString(),
        cause: diagnosis.cause,
        action: r.action,
        ok,
        detail: String(r.detail || "").slice(0, 300),
      });
      this.log.emit("log", `Preview recovery ${ok ? "succeeded" : "failed"} (${diagnosis.cause} → ${r.action})${r.detail ? `: ${String(r.detail).slice(0, 200)}` : ""}`, {
        phase: "preview_recovery",
        cause: diagnosis.cause,
        action: r.action,
        ok,
      });
      if (ok) {
        recovered = true;
        break;
      }
      const next = probe.diagnosis || (await this.diagnose());
      // Same failure twice in a row → restarting again will not help.
      if (next.cause === diagnosis.cause && r.action !== "install+restart") {
        diagnosis = next;
        break;
      }
      diagnosis = next;
    }

    if (recovered) {
      this.last = { ok: true, kind: "none", cause: "healthy", detail: "", attempts, recovered: true, status: probe.status };
      return this.last;
    }
    const kind = diagnosis.kind === "app" ? "app" : "infra";
    this.last = {
      ok: false,
      kind,
      cause: diagnosis.cause,
      detail: diagnosis.detail || probe.error || "The preview server is not responding.",
      attempts,
      recovered: false,
      status: 0,
    };
    return this.last;
  }

  /** Compact, operator-facing summary for job facts / failed events. */
  summary() {
    return {
      recoveries: this.recoveries,
      installs: this.installsRun,
      history: this.history.slice(-8),
      last: this.last,
    };
  }

  /** @param {EnsureResult} r */
  agentMessage(r) {
    return PreviewSupervisor.agentMessage(r);
  }

  /**
   * Text handed to the coding agent when the preview cannot be used. Keeps the
   * agent from "fixing" routes for an infrastructure problem.
   * @param {EnsureResult} r
   */
  static agentMessage(r) {
    if (r.kind === "app") {
      return [
        `PREVIEW DOWN — APPLICATION ERROR (${r.cause}). The dev server cannot start because of a code problem:`,
        r.detail,
        "Fix this (it is your bug), then call check_preview again. Do not start the server yourself.",
      ].join("\n");
    }
    return [
      `PREVIEW UNAVAILABLE — INFRASTRUCTURE (${r.cause}). The preview server is not reachable right now and Cander already tried to restart it (${r.attempts} attempt${r.attempts === 1 ? "" : "s"}).`,
      "This is NOT a bug in your pages. Do not edit routes, layouts or app/opengraph-image.tsx because of this, and do not run npm run dev / next dev.",
      "Keep building from the plan, run tsc to catch type errors, and call finish(summary, routes) when the code is complete. Cander's server will bring the preview up and verify every route.",
    ].join("\n");
  }
}
