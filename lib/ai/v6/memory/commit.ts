/**
 * Memory commit — structured useful state only.
 */

import type {
  AnswerBundle,
  ContextEntity,
  MemoryDelta,
  RequestResult,
} from "../types.ts";

export function buildMemoryDelta(args: {
  bundle: AnswerBundle;
  topic?: string;
}): MemoryDelta {
  const activeEntities: ContextEntity[] = [];
  const verifiedFacts = [];

  for (const r of args.bundle.results) {
    if (r.status !== "verified") continue;
    const req = args.bundle.spec.requests.find((x) => x.id === r.requestId);
    if (req?.subject?.type === "named") {
      activeEntities.push({
        id: `ent_${req.subject.value.toLowerCase().replace(/\s+/g, "_")}`,
        name: req.subject.value,
        kind: "entity",
      });
    }
    if (req?.property) {
      verifiedFacts.push({
        key: `${req.subject?.type === "named" ? req.subject.value : "x"}.${req.property}`,
        value: r.value,
        observedAt: new Date().toISOString(),
        ttlMs: 24 * 60 * 60 * 1000,
      });
    }
  }

  let activeCalculation: MemoryDelta["activeCalculation"];
  const cal = args.bundle.results.find(
    (r) =>
      r.status === "verified" &&
      typeof r.value === "number" &&
      args.bundle.spec.requests.find((q) => q.id === r.requestId)?.kind ===
        "calculate",
  );
  if (cal) {
    activeCalculation = {
      subject: "calculation",
      perItem: Number(cal.value),
    };
  }

  // Nutrition follow-up cache — prefer per-item calories
  const nutrReq = args.bundle.spec.requests.find((q) =>
    (q.property || "").includes("calories"),
  );
  const nutr = nutrReq
    ? args.bundle.results.find((r) => r.requestId === nutrReq.id)
    : undefined;
  if (nutr && nutr.status === "verified") {
    const raw = String(nutr.value);
    const m = raw.match(/(\d+)\s*cal/i);
    if (m) {
      activeCalculation = {
        subject: nutrReq?.subject?.type === "named" ? nutrReq.subject.value : "calories",
        unit: "calories",
        perItem: Number(m[1]),
        quantity: typeof nutrReq?.qualifiers?.quantity === "number"
          ? nutrReq.qualifiers.quantity
          : undefined,
      };
    }
  }

  return {
    activeEntities: dedupeEntities(activeEntities),
    verifiedFacts: verifiedFacts.slice(0, 10),
    activeCalculation,
    topic: args.topic,
  };
}

function dedupeEntities(ents: ContextEntity[]): ContextEntity[] {
  const seen = new Set<string>();
  return ents.filter((e) => {
    const k = e.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const memoryByThread = new Map<string, MemoryDelta>();

export function commitMemoryDelta(
  threadId: string | null | undefined,
  delta: MemoryDelta,
): void {
  if (!threadId) return;
  const prev = memoryByThread.get(threadId) || {};
  memoryByThread.set(threadId, {
    activeEntities: [
      ...(prev.activeEntities || []),
      ...(delta.activeEntities || []),
    ].slice(-20),
    verifiedFacts: [
      ...(prev.verifiedFacts || []),
      ...(delta.verifiedFacts || []),
    ].slice(-30),
    activeCalculation: delta.activeCalculation ?? prev.activeCalculation,
    topic: delta.topic ?? prev.topic,
  });
}

export function loadMemoryDelta(
  threadId: string | null | undefined,
): MemoryDelta | undefined {
  if (!threadId) return undefined;
  return memoryByThread.get(threadId);
}

/** Test helper */
export function clearMemoryStore(): void {
  memoryByThread.clear();
}
