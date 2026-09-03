/**
 * Client speculation controller — debounce, cancel, warm → draft.
 * Drafts for LOCAL + UNCERTAIN (tools-off). Skips WEB_REQUIRED / connectors.
 */

"use client";

import { getRawOpenAIAuthHeaders } from "@/lib/ai/raw-openai/upload-client";
import { isComposerSpeculationEnabled } from "./flags";
import {
  normalizeSpeculationText,
  shouldEscalateSpeculation,
  shouldEvaluateSpeculation,
  speculationFingerprint,
  speculationWordCount,
  type SpeculationMeta,
} from "./fingerprint";
import {
  clearComposerSpeculationSnapshot,
  setComposerSpeculationSnapshot,
  setPendingSpeculationDraft,
} from "./session-store";

const DEBOUNCE_MS = 320;
const CLIENT_DRAFT_BUDGET_PER_MIN = 10;

export type SpeculationControllerOptions = {
  getMeta: () => SpeculationMeta;
  shouldSkip: () => boolean;
};

type WarmResponse = {
  route?: "LOCAL" | "WEB_REQUIRED" | "UNCERTAIN";
  warmHandle?: string;
  error?: string;
};

type DraftResponse = {
  draftText?: string;
  model?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
};

function logSpec(event: string, detail?: Record<string, unknown>) {
  try {
    console.debug("[SPECULATION]", event, detail ?? {});
  } catch {
    /* ignore */
  }
}

export function createComposerSpeculationController(
  opts: SpeculationControllerOptions,
) {
  let gen = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abort: AbortController | null = null;
  let lastEvalWordCount = 0;
  let lastText = "";
  let lastFingerprint = "";
  let draftWindowStart = Date.now();
  let draftsThisWindow = 0;
  let sending = false;
  const speculateId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `spec_${Date.now()}`;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const cancelInFlight = () => {
    abort?.abort();
    abort = null;
    setPendingSpeculationDraft(null);
  };

  const allowClientDraft = () => {
    const now = Date.now();
    if (now - draftWindowStart > 60_000) {
      draftWindowStart = now;
      draftsThisWindow = 0;
    }
    if (draftsThisWindow >= CLIENT_DRAFT_BUDGET_PER_MIN) return false;
    draftsThisWindow += 1;
    return true;
  };

  const run = async (text: string) => {
    if (!isComposerSpeculationEnabled()) return;
    if (opts.shouldSkip()) return;
    if (!shouldEvaluateSpeculation(text)) {
      logSpec("skip_too_short", { words: speculationWordCount(text) });
      return;
    }

    const meta = opts.getMeta();
    if ((meta.attachmentCount ?? 0) > 0) {
      logSpec("skip_attachments");
      return;
    }
    if ((meta.connectionIds?.length ?? 0) > 0) {
      logSpec("skip_connectors");
      return;
    }

    const myGen = ++gen;
    cancelInFlight();
    const ac = new AbortController();
    abort = ac;

    const fingerprint = speculationFingerprint(text, meta);
    const textNorm = normalizeSpeculationText(text);
    lastEvalWordCount = speculationWordCount(text);
    lastFingerprint = fingerprint;

    let resolvePending: (v: ReturnType<typeof Object> | null) => void = () => {};
    const pendingPromise = new Promise<
      import("./session-store").ComposerSpeculationSnapshot | null
    >((resolve) => {
      resolvePending = resolve as typeof resolvePending;
    });
    setPendingSpeculationDraft({ fingerprint, promise: pendingPromise });

    try {
      const headers = await getRawOpenAIAuthHeaders();
      if (!headers.Authorization) {
        logSpec("skip_no_auth");
        resolvePending(null);
        setPendingSpeculationDraft(null);
        return;
      }
      if (ac.signal.aborted || myGen !== gen) {
        resolvePending(null);
        return;
      }

      logSpec("warm_start", { words: lastEvalWordCount, fingerprint });
      const warmRes = await fetch("/api/ai/speculate/warm", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: ac.signal,
        body: JSON.stringify({
          speculateId,
          gen: myGen,
          workspaceId: meta.workspaceId ?? null,
          threadId: meta.threadId ?? null,
          text: textNorm,
          inputFingerprint: fingerprint,
        }),
      });
      const warm = (await warmRes.json().catch(() => ({}))) as WarmResponse;
      if (ac.signal.aborted || myGen !== gen) {
        resolvePending(null);
        return;
      }
      if (!warmRes.ok || !warm.warmHandle || !warm.route) {
        logSpec("warm_fail", {
          status: warmRes.status,
          error: warm.error,
        });
        resolvePending(null);
        setPendingSpeculationDraft(null);
        return;
      }

      logSpec("warm_ok", { route: warm.route });

      const tier1 = {
        speculateId,
        gen: myGen,
        warmHandle: warm.warmHandle,
        inputFingerprint: fingerprint,
        route: warm.route,
        textNorm,
        tier: 1 as const,
        updatedAt: Date.now(),
      };
      setComposerSpeculationSnapshot(tier1);

      // Draft for LOCAL + UNCERTAIN (tools-off knowledge). Skip live/web-required.
      const wantDraft =
        warm.route !== "WEB_REQUIRED" &&
        speculationWordCount(text) >= 5 &&
        allowClientDraft();

      if (!wantDraft) {
        logSpec("draft_skip", { route: warm.route });
        resolvePending(null);
        setPendingSpeculationDraft(null);
        return;
      }

      logSpec("draft_start", { route: warm.route });
      const draftRes = await fetch("/api/ai/speculate/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: ac.signal,
        body: JSON.stringify({
          speculateId,
          gen: myGen,
          warmHandle: warm.warmHandle,
          workspaceId: meta.workspaceId ?? null,
          threadId: meta.threadId ?? null,
          text: textNorm,
          inputFingerprint: fingerprint,
        }),
      });
      const draft = (await draftRes.json().catch(() => ({}))) as DraftResponse;
      if (ac.signal.aborted || myGen !== gen) {
        resolvePending(null);
        return;
      }
      if (!draftRes.ok || draft.skipped || !draft.draftText) {
        logSpec("draft_fail", {
          status: draftRes.status,
          skipped: draft.skipped,
          reason: draft.reason,
          error: draft.error,
        });
        resolvePending(null);
        setPendingSpeculationDraft(null);
        return;
      }

      const ready = {
        ...tier1,
        draftText: draft.draftText,
        model: draft.model,
        tier: 2 as const,
        updatedAt: Date.now(),
      };
      setComposerSpeculationSnapshot(ready);
      logSpec("draft_ready", {
        chars: draft.draftText.length,
        model: draft.model,
      });
      resolvePending(ready);
    } catch (e) {
      if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
        resolvePending(null);
        return;
      }
      logSpec("error", {
        message: e instanceof Error ? e.message.slice(0, 120) : "unknown",
      });
      resolvePending(null);
      setPendingSpeculationDraft(null);
    }
  };

  return {
    onTextChange(text: string) {
      if (sending) {
        // Empty clear after Send — keep pending draft. New typing starts fresh.
        if (text.trim()) {
          sending = false;
          clearTimer();
          cancelInFlight();
          clearComposerSpeculationSnapshot();
          lastEvalWordCount = 0;
          lastFingerprint = "";
          lastText = text;
          // fall through to schedule
        } else {
          return;
        }
      }
      if (!isComposerSpeculationEnabled()) {
        clearComposerSpeculationSnapshot();
        return;
      }
      if (opts.shouldSkip()) {
        clearTimer();
        cancelInFlight();
        return;
      }
      lastText = text;
      if (!text.trim()) {
        clearTimer();
        cancelInFlight();
        clearComposerSpeculationSnapshot();
        lastEvalWordCount = 0;
        lastFingerprint = "";
        return;
      }

      clearTimer();
      const escalate =
        shouldEvaluateSpeculation(text) &&
        shouldEscalateSpeculation({
          text,
          lastEvalWordCount,
        });
      const delay = escalate ? 280 : DEBOUNCE_MS;
      timer = setTimeout(() => {
        void run(lastText);
      }, delay);
    },

    /** Immediate run after dictation settles (no debounce). */
    onStabilizedText(text: string) {
      if (!isComposerSpeculationEnabled()) return;
      sending = false;
      lastText = text;
      if (!text.trim()) return;
      clearTimer();
      void run(text);
    },

    /** Keep in-flight draft + snapshot; stop further typing timers. */
    prepareSend() {
      sending = true;
      clearTimer();
      logSpec("prepare_send", { fingerprint: lastFingerprint });
    },

    reset() {
      sending = false;
      clearTimer();
      cancelInFlight();
      clearComposerSpeculationSnapshot();
      lastEvalWordCount = 0;
      lastText = "";
      lastFingerprint = "";
      gen += 1;
    },

    dispose() {
      this.reset();
    },

    getLastFingerprint() {
      return lastFingerprint;
    },
  };
}

export type ComposerSpeculationController = ReturnType<
  typeof createComposerSpeculationController
>;
