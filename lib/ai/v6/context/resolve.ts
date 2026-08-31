/**
 * Stage 3 — Context resolution (tenant-scoped).
 */

import type { AiGenerateRequest } from "@/lib/ai/runtime/types";

import { clarificationFromAmbiguity, resolveReferences } from "./references.ts";
import type {
  CompactTurn,
  ContextEntity,
  ContextGate,
  ContextItem,
  ContextPacket,
  KnowledgeBaseHint,
  RetrievalScope,
  ResolvedReference,
} from "../types.ts";

export type ResolveContextArgs = {
  request: AiGenerateRequest;
  scope: RetrievalScope;
  gate: ContextGate;
  /** Injected for tests / optional live retrieval */
  loadMemory?: (scope: RetrievalScope, q: string) => Promise<ContextItem[]>;
  loadPriorChats?: (scope: RetrievalScope, q: string) => Promise<ContextItem[]>;
  loadKbHints?: (
    scope: RetrievalScope,
    q: string,
  ) => Promise<KnowledgeBaseHint[]>;
  activeEntities?: ContextEntity[];
};

export function buildRetrievalScope(
  request: AiGenerateRequest,
  opts?: { userId?: string; tenantId?: string },
): RetrievalScope {
  const workspaceId = request.workspaceId || undefined;
  return {
    userId: opts?.userId || "local-user",
    tenantId: opts?.tenantId || workspaceId || "local-tenant",
    workspaceId,
    threadId: request.threadId ?? undefined,
  };
}

export async function resolveContext(
  args: ResolveContextArgs,
): Promise<{
  packet: ContextPacket;
  ambiguousClarification: ReturnType<typeof clarificationFromAmbiguity>;
}> {
  const { request, scope, gate } = args;
  if (!scope.userId || !scope.tenantId) {
    throw new Error("RetrievalScope requires userId and tenantId");
  }

  const text = (request.content || "").trim();
  const recentTurns: CompactTurn[] = (request.messages ?? [])
    .slice(-8)
    .map((m) => ({
      role: m.role,
      content: (m.content || "").slice(0, 500),
    }));

  const activeEntities = args.activeEntities ?? [];
  const resolvedReferences: ResolvedReference[] = resolveReferences(
    text,
    activeEntities,
  );

  let relevantMemories: ContextItem[] = [];
  let priorChatMatches: ContextItem[] = [];
  let knowledgeBaseHints: KnowledgeBaseHint[] = [];

  if (gate.searchMemory && args.loadMemory) {
    relevantMemories = await args.loadMemory(scope, text);
  }
  if (gate.searchPriorChats && args.loadPriorChats) {
    priorChatMatches = await args.loadPriorChats(scope, text);
  }
  if (gate.inspectKnowledgeBaseMetadata && args.loadKbHints) {
    knowledgeBaseHints = await args.loadKbHints(scope, text);
  }

  // Seed entities from prior-chat snippets if none
  if (!activeEntities.length && priorChatMatches.length) {
    for (const m of priorChatMatches.slice(0, 3)) {
      const nameMatch = m.text.match(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)\b/);
      if (nameMatch) {
        activeEntities.push({
          id: `ent_${activeEntities.length + 1}`,
          name: nameMatch[1]!,
          kind: "company",
        });
      }
    }
    resolvedReferences.push(...resolveReferences(text, activeEntities));
  }

  const packet: ContextPacket = {
    now: new Date().toISOString(),
    recentTurns,
    activeEntities,
    relevantMemories,
    priorChatMatches,
    knowledgeBaseHints,
    resolvedReferences,
  };

  return {
    packet,
    ambiguousClarification: clarificationFromAmbiguity(resolvedReferences),
  };
}
