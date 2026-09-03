/**
 * Client-held speculation result for Send reuse.
 * Never written to durable chat until Send accepts it.
 */

import type { KnowledgeRoute } from "@/lib/ai/simple-turn/knowledge-route";

export type ComposerSpeculationSnapshot = {
  speculateId: string;
  gen: number;
  warmHandle: string;
  inputFingerprint: string;
  route: KnowledgeRoute;
  textNorm: string;
  draftText?: string;
  model?: string;
  tier: 1 | 2;
  updatedAt: number;
};

type PendingDraft = {
  fingerprint: string;
  promise: Promise<ComposerSpeculationSnapshot | null>;
};

let snapshot: ComposerSpeculationSnapshot | null = null;
let pending: PendingDraft | null = null;
let listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export function getComposerSpeculationSnapshot(): ComposerSpeculationSnapshot | null {
  return snapshot;
}

export function setComposerSpeculationSnapshot(
  next: ComposerSpeculationSnapshot | null,
) {
  snapshot = next;
  emit();
}

export function clearComposerSpeculationSnapshot() {
  snapshot = null;
  emit();
}

/** Register an in-flight draft so Send can await it. */
export function setPendingSpeculationDraft(next: PendingDraft | null) {
  pending = next;
}

export function getPendingSpeculationDraft(): PendingDraft | null {
  return pending;
}

export function subscribeComposerSpeculation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function takeReady(fingerprint: string) {
  const cur = snapshot;
  if (!cur || cur.inputFingerprint !== fingerprint || !cur.draftText) {
    return null;
  }
  clearComposerSpeculationSnapshot();
  pending = null;
  return {
    warmHandle: cur.warmHandle,
    inputFingerprint: cur.inputFingerprint,
    route: cur.route,
    draftText: cur.draftText,
    speculateId: cur.speculateId,
    gen: cur.gen,
    tier: cur.tier,
  };
}

/**
 * On Send: reclaim matching draft. Waits briefly for an in-flight draft
 * with the same fingerprint so a pause + Send still hits the cache.
 */
export async function takeComposerSpeculationForSend(opts: {
  text: string;
  fingerprint: string;
  waitMs?: number;
}): Promise<{
  warmHandle: string;
  inputFingerprint: string;
  route: KnowledgeRoute;
  draftText: string;
  speculateId: string;
  gen: number;
  tier: 1 | 2;
} | null> {
  const ready = takeReady(opts.fingerprint);
  if (ready?.draftText) return ready as {
    warmHandle: string;
    inputFingerprint: string;
    route: KnowledgeRoute;
    draftText: string;
    speculateId: string;
    gen: number;
    tier: 1 | 2;
  };

  const waitMs = opts.waitMs ?? 12_000;
  const pend = pending;
  if (!pend || pend.fingerprint !== opts.fingerprint) {
    if (snapshot && snapshot.inputFingerprint !== opts.fingerprint) {
      clearComposerSpeculationSnapshot();
    }
    return null;
  }

  try {
    const raced = await Promise.race([
      pend.promise,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), waitMs),
      ),
    ]);
    if (raced?.draftText && raced.inputFingerprint === opts.fingerprint) {
      clearComposerSpeculationSnapshot();
      pending = null;
      return {
        warmHandle: raced.warmHandle,
        inputFingerprint: raced.inputFingerprint,
        route: raced.route,
        draftText: raced.draftText,
        speculateId: raced.speculateId,
        gen: raced.gen,
        tier: raced.tier,
      };
    }
  } catch {
    /* ignore */
  }

  // Final peek in case snapshot landed after race timeout edge
  const again = takeReady(opts.fingerprint);
  return again?.draftText
    ? (again as {
        warmHandle: string;
        inputFingerprint: string;
        route: KnowledgeRoute;
        draftText: string;
        speculateId: string;
        gen: number;
        tier: 1 | 2;
      })
    : null;
}
