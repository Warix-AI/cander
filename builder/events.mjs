// Progress stream for a build job.
// Always appends to <jobDir>/events.jsonl (Cander pulls this file), and
// best-effort pushes batches to the callback API when one is configured.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
    mkdirSync(dirname(this.file), { recursive: true });
  }

  /**
   * @param {string} kind
   * @param {string} message
   * @param {Record<string, unknown>} [payload]
   */
  emit(kind, message, payload) {
    this.seq += 1;
    const event = {
      seq: this.seq,
      ts: new Date().toISOString(),
      kind,
      message: String(message ?? "").slice(0, 2000),
      payload: payload ?? {},
    };
    try {
      appendFileSync(this.file, `${JSON.stringify(event)}\n`);
    } catch (err) {
      // Never let logging kill the build.
      process.stderr.write(`[builder] event write failed: ${err?.message}\n`);
    }
    process.stdout.write(`[${kind}] ${event.message}\n`);
    if (this.apiBase && this.token) {
      this.pending.push(event);
      this.scheduleFlush();
    }
    return event;
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
        // Pull path still has the file; don't retry forever.
        process.stderr.write(`[builder] event push HTTP ${res.status}\n`);
      }
    } catch {
      /* callback unreachable — the file is the source of truth */
    }
    if (this.pending.length) this.scheduleFlush();
  }

  async close() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Drain remaining batches.
    for (let i = 0; i < 10 && this.pending.length; i++) {
      await this.flush();
    }
  }
}
