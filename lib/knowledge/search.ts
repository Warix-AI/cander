import { policyFor } from "@/lib/workspace-policy";

export type KnowledgeSearchHit = {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  fileId: string;
  fileName: string;
  excerpt: string;
  score: number;
};

const MAX_HITS = 5;
const EXCERPT_CHARS = 480;

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function scoreText(haystack: string, terms: string[]): number {
  if (!haystack || !terms.length) return 0;
  const lower = haystack.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!lower.includes(term)) continue;
    const matches = lower.split(term).length - 1;
    score += matches * (term.length > 4 ? 3 : 2);
  }
  return score;
}

function excerptAround(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  let idx = 0;
  for (const term of terms) {
    const at = lower.indexOf(term);
    if (at >= 0) {
      idx = at;
      break;
    }
  }
  const start = Math.max(0, idx - 80);
  const slice = text.slice(start, start + EXCERPT_CHARS).trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = start + EXCERPT_CHARS < text.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}

/** Keyword rank over workspace KB file bodies (member-scoped via local policy). */
export function searchWorkspaceKnowledge(
  workspaceId: string,
  query: string,
): KnowledgeSearchHit[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const policy = policyFor(workspaceId);
  const hits: KnowledgeSearchHit[] = [];

  for (const kb of policy.knowledgeBases) {
    for (const file of kb.files) {
      const body = (file.contentText ?? "").trim();
      if (!body) continue;
      const blob = `${kb.name}\n${file.name}\n${body}`;
      const score = scoreText(blob, terms);
      if (score <= 0) continue;
      hits.push({
        knowledgeBaseId: kb.id,
        knowledgeBaseName: kb.name,
        fileId: file.id,
        fileName: file.name,
        excerpt: excerptAround(body, terms),
        score,
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_HITS);
}

export function listKnowledgeBaseTitles(workspaceId: string): string[] {
  return policyFor(workspaceId).knowledgeBases.map((kb) => kb.name);
}
