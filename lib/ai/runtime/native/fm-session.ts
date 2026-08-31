/**
 * KV-cache-aware FM session registry (v4 §7 Phase 3).
 * Holds durable session ids per thread + profile until topic switch or instruction change.
 */

import type { TurnRelation } from "../turn-environment/turn-relation.ts";
import type { DynamicProfilePayload } from "../turn-environment/dynamic-profile.ts";
import {
  getFoundationModelsAvailability,
  prewarmFoundationModelsSession,
} from "./foundation-models.ts";

export type FmSessionProfile = "synthesis" | "plan" | "delta";

type SessionEntry = {
  sessionId: string;
  instructionsHash: string;
  createdAt: number;
  lastUsedAt: number;
};

const registry = new Map<string, SessionEntry>();
let sessionCounter = 0;

function hashInstructions(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function registryKey(
  threadId: string,
  profile: FmSessionProfile,
  instructionsHash: string,
): string {
  return `${threadId}:${profile}:${instructionsHash}`;
}

export function invalidateFmSessionsForThread(threadId: string): void {
  for (const key of registry.keys()) {
    if (key.startsWith(`${threadId}:`)) registry.delete(key);
  }
}

export function invalidateFmSessionsOnTurnRelation(
  threadId: string,
  turnRelation: TurnRelation,
): void {
  if (turnRelation === "topic_switch") {
    invalidateFmSessionsForThread(threadId);
  }
}

export function resolveFmSession(opts: {
  threadId: string;
  profile: FmSessionProfile;
  instructions: string;
}): { sessionId: string; reused: boolean } {
  const instructionsHash = hashInstructions(opts.instructions.trim());
  const key = registryKey(opts.threadId, opts.profile, instructionsHash);
  const existing = registry.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return { sessionId: existing.sessionId, reused: true };
  }
  const sessionId = `${opts.threadId}-${opts.profile}-${instructionsHash}-${Date.now()}-${sessionCounter++}`;
  registry.set(key, {
    sessionId,
    instructionsHash,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
  return { sessionId, reused: false };
}

/** Fire-and-forget prewarm after compile — native no-op until bridge supports it. */
export async function prewarmFmSession(opts: {
  threadId: string;
  profile: FmSessionProfile;
  instructions: string;
  dynamicPayload?: DynamicProfilePayload;
}): Promise<void> {
  const avail = await getFoundationModelsAvailability();
  if (!avail.available) return;
  const { sessionId } = resolveFmSession({
    threadId: opts.threadId,
    profile: opts.profile,
    instructions: opts.instructions,
  });
  try {
    await prewarmFoundationModelsSession({
      sessionId,
      instructions: opts.instructions,
      dynamicPayload: opts.dynamicPayload,
    });
  } catch {
    // Prewarm must never block the turn.
  }
}

/** Test-only reset. */
export function resetFmSessionRegistry(): void {
  registry.clear();
  sessionCounter = 0;
}
