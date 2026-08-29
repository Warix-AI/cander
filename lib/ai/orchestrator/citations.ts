/**
 * Citation validation — client mirror for tests.
 */

export type CitationSource = {
  id: string;
  title: string;
  url?: string | null;
};

export function validateCitations(opts: {
  answer: string;
  sources: CitationSource[];
}): { text: string; strippedUrls: string[] } {
  const allowedUrls = new Set(
    opts.sources
      .map((s) => (s.url ?? "").trim())
      .filter(Boolean)
      .map((u) => u.replace(/\/$/, "").toLowerCase()),
  );

  const urlRe = /https?:\/\/[^\s)\]>"']+/gi;
  const found = opts.answer.match(urlRe) ?? [];
  const strippedUrls: string[] = [];
  let text = opts.answer;

  for (const raw of found) {
    const norm = raw
      .replace(/[.,;:!?)]+$/, "")
      .replace(/\/$/, "")
      .toLowerCase();
    const ok = [...allowedUrls].some(
      (a) => a === norm || norm.startsWith(a) || a.startsWith(norm),
    );
    if (!ok) {
      strippedUrls.push(raw);
      text = text.split(raw).join("[source omitted]");
    }
  }

  if (!opts.sources.length) {
    text = text.replace(
      /\b(according to|based on|from)\b[\s\S]{0,40}\b(search|sources?|the web)\b/gi,
      "based on available information",
    );
  }

  return { text, strippedUrls };
}
