// Progress stream for a build job.
// Always appends to <jobDir>/events.jsonl (Cander pulls this file), and
// best-effort pushes batches to the callback API when one is configured.
//
// Heartbeats: long stages can call startHeartbeat() so the UI sees a new
// sanitized status every ~30s while work is actually alive — never fake
// completion, never spam duplicates.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const HEARTBEAT_MS = 32_000;
const DEDUPE_MS = 12_000;

export class EventLog {
  /**
   * @param {{ file: string, apiBase?: string|null, jobId: string, token?: string|null }} opts
   */
  constructor(opts) {
    this.file = opts.file;
    this.apiBase = opts.apiBase || null;
    this.jobId = opts.jobId;
    this.token = opts.token || null;
    this.seq = 0;
    this.pending = [];
    this.flushTimer = null;
    /** @type {ReturnType<typeof setInterval>|null} */
    this.heartbeatTimer = null;
    this.heartbeatPhase = "";
    this.heartbeatLabels = [];
    this.heartbeatIndex = 0;
    this.lastProgressKey = "";
    this.lastProgressAt = 0;
    mkdirSync(dirname(this.file), { recursive: true });
  }

  /**
   * @param {string} kind
   * @param {string} message
   * @param {Record<string, unknown>} [payload]
   */
  emit(kind, message, payload) {
    const msg = String(message ?? "").slice(0, 2000);
    if (kind === "progress" || kind === "status") {
      const key = `${kind}:${msg}`;
      const now = Date.now();
      if (key === this.lastProgressKey && now - this.lastProgressAt < DEDUPE_MS) {
        return null;
      }
      this.lastProgressKey = key;
      this.lastProgressAt = now;
    }

    this.seq += 1;
    const event = {
      seq: this.seq,
      ts: new Date().toISOString(),
      kind,
      message: msg,
      payload: payload ?? {},
    };
    try {
      appendFileSync(this.file, `${JSON.stringify(event)}\n`);
    } catch (err) {
      process.stderr.write(`[builder] event write failed: ${err?.message}\n`);
    }
    process.stdout.write(`[${kind}] ${event.message}\n`);
    if (this.apiBase && this.token) {
      this.pending.push(event);
      this.scheduleFlush();
    }
    return event;
  }

  /**
   * Emit user-facing progress with optional phase/detail metadata.
   * @param {string} label
   * @param {{ phase?: string, detail?: string } & Record<string, unknown>} [meta]
   */
  progress(label, meta = {}) {
    const { phase, detail, ...rest } = meta;
    const message = detail ? `${label} — ${detail}` : label;
    return this.emit("progress", message, {
      ...(phase ? { phase } : {}),
      ...(detail ? { detail } : {}),
      ...rest,
    });
  }

  /**
   * While a long task runs, rotate reassuring progress lines every ~32s.
   * Only call while the task is known-alive; stopHeartbeat when it ends.
   * @param {string} phase
   * @param {string[]} labels  rotating messages (first is emitted immediately)
   */
  startHeartbeat(phase, labels) {
    this.stopHeartbeat();
    const list = (labels || []).map(String).filter(Boolean);
    if (!list.length) return;
    this.heartbeatPhase = phase;
    this.heartbeatLabels = list;
    this.heartbeatIndex = 0;
    this.progress(list[0], { phase, heartbeat: true });
    this.heartbeatTimer = setInterval(() => {
      this.heartbeatIndex = (this.heartbeatIndex + 1) % list.length;
      const label = list[this.heartbeatIndex];
      // Prefer later reassuring variants after the first tick.
      this.emit("progress", label, { phase: this.heartbeatPhase, heartbeat: true });
    }, HEARTBEAT_MS);
    if (typeof this.heartbeatTimer.unref === "function") this.heartbeatTimer.unref();
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatPhase = "";
    this.heartbeatLabels = [];
    this.heartbeatIndex = 0;
  }

  scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 750);
  }

  async flush() {
    if (!this.apiBase || !this.token || this.pending.length === 0) return;
    const batch = this.pending.splice(0, 50);
    try {
      const res = await fetch(
        `${this.apiBase}/api/build-jobs/${encodeURIComponent(this.jobId)}/events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({ events: batch }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) {
        process.stderr.write(`[builder] event push HTTP ${res.status}\n`);
      }
    } catch {
      /* callback unreachable — the file is the source of truth */
    }
    if (this.pending.length) this.scheduleFlush();
  }

  async close() {
    this.stopHeartbeat();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    for (let i = 0; i < 10 && this.pending.length; i++) {
      await this.flush();
    }
  }
}
