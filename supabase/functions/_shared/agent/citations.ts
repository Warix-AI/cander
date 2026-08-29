import type { RetrievalSource } from "./types.ts";

/** Strip / reject fabricated citations not in retrieved source IDs or URLs. */
export function validateCitations(opts: {
  answer: string;
  sources: RetrievalSource[];
}): { text: string; strippedUrls: string[]; validIds: string[] } {
  const allowedUrls = new Set(
    opts.sources
      .map((s) => (s.url ?? "").trim())
      .filter(Boolean)
      .map((u) => u.replace(/\/$/, "").toLowerCase()),
  );
  const allowedIds = new Set(opts.sources.map((s) => s.id));

  const urlRe = /https?:\/\/[^\s)\]>"']+/gi;
  const found = opts.answer.match(urlRe) ?? [];
  const strippedUrls: string[] = [];
  let text = opts.answer;

  for (const raw of found) {
    const norm = raw.replace(/[.,;:!?)]+$/, "").replace(/\/$/, "").toLowerCase();
    const ok = [...allowedUrls].some(
      (a) => a === norm || norm.startsWith(a) || a.startsWith(norm),
    );
    if (!ok) {
      strippedUrls.push(raw);
      text = text.split(raw).join("[source omitted]");
    }
  }

  // Drop claims of search when no sources
  if (!opts.sources.length) {
    text = text.replace(
      /\b(according to|based on|from)\b[\s\S]{0,40}\b(search|sources?|the web)\b/gi,
      "based on available information",
    );
  }

  return {
    text,
    strippedUrls,
    validIds: [...allowedIds],
  };
}

export function formatSourcesForPrompt(sources: RetrievalSource[]): string {
  if (!sources.length) return "(no retrieval sources)";
  return sources
    .map(
      (s, i) =>
        `${i + 1}. id=${s.id} title=${s.title}${
          s.url ? ` url=${s.url}` : ""
        }\n   ${s.snippet ?? ""}`,
    )
    .join("\n");
}
