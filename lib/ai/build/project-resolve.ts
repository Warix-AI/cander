/**
 * Fail-safe project resolution — never silently pick "latest".
 */

import type { ConversationTurnState } from "../turn-environment/conversation-types.ts";
import { isBuildCreateIntent } from "./capabilities.ts";
import type { ProjectResolveResult } from "./types.ts";

export type ProjectCandidate = {
  id: string;
  title: string;
  kind?: string;
};

export type ResolveBuildProjectInput = {
  content: string;
  /** 1. Explicit on request */
  explicitProjectId?: string | null;
  /** 2. Thread attachment */
  threadProjectId?: string | null;
  conversationState?: ConversationTurnState | null;
  /** Known workspace projects for unique reference match */
  candidates?: ProjectCandidate[];
};

export function resolveBuildProject(
  input: ResolveBuildProjectInput,
): ProjectResolveResult {
  if (input.explicitProjectId?.trim()) {
    return {
      status: "resolved",
      projectId: input.explicitProjectId.trim(),
      reason: "explicit_project_id",
    };
  }

  if (input.threadProjectId?.trim()) {
    return {
      status: "resolved",
      projectId: input.threadProjectId.trim(),
      reason: "thread_project",
    };
  }

  const activeProject = input.conversationState?.entities.find(
    (e) =>
      e.contextClass === "ACTIVE" &&
      (e.type === "project" || e.type === "build_project"),
  );
  if (activeProject?.id) {
    return {
      status: "resolved",
      projectId: activeProject.id,
      reason: "active_conversation_entity",
    };
  }

  const candidates = input.candidates ?? [];
  const referenced = matchReferencedProjects(input.content, candidates);
  if (referenced.length === 1) {
    return {
      status: "resolved",
      projectId: referenced[0]!.id,
      reason: "unique_reference",
    };
  }
  if (referenced.length > 1) {
    return {
      status: "clarify",
      projectId: null,
      reason: "ambiguous_project_reference",
      candidates: referenced.map((c) => ({ id: c.id, title: c.title })),
    };
  }

  // Ambiguous mutation without identity ("change the homepage")
  if (
    /\b(change|update|edit|fix|make)\b/i.test(input.content) &&
    /\b(homepage|home\s*page|hero|pricing|site|app)\b/i.test(input.content) &&
    candidates.length > 1 &&
    !isBuildCreateIntent(input.content)
  ) {
    return {
      status: "clarify",
      projectId: null,
      reason: "ambiguous_mutation",
      candidates: candidates.slice(0, 5).map((c) => ({
        id: c.id,
        title: c.title,
      })),
    };
  }

  if (isBuildCreateIntent(input.content)) {
    return {
      status: "create",
      projectId: null,
      reason: "create_intent",
    };
  }

  return {
    status: "none",
    projectId: null,
    reason: "no_project_resolved",
  };
}

function matchReferencedProjects(
  content: string,
  candidates: ProjectCandidate[],
): ProjectCandidate[] {
  const lower = content.toLowerCase();
  return candidates.filter((c) => {
    const title = c.title.trim().toLowerCase();
    if (title.length < 3) return false;
    return lower.includes(title);
  });
}
