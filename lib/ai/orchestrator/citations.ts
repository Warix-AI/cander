/**
 * Citation validation — client mirror for tests.
 * Never invents URLs; only allows http(s) URLs present in retrieved sources.
 */

export type CitationSource = {
  id: string;
  title: string;
  url?: string | null;
};

function normalizeUrl(raw: string): string {
  return raw
    .replace(/[.,;:!?)]+$/, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateCitations(opts: {
  answer: string;
  sources: CitationSource[];
}): { text: string; strippedUrls: string[] } {
  const allowedUrls = new Set(
    opts.sources
      .map((s) => (s.url ?? "").trim())
      .filter((u) => u && isSafeHttpUrl(u))
      .map((u) => normalizeUrl(u)),
  );

  const urlRe = /https?:\/\/[^\s)\]>"']+/gi;
  const found = opts.answer.match(urlRe) ?? [];
  const strippedUrls: string[] = [];
  let text = opts.answer;

  for (const raw of found) {
    const cleaned = raw.replace(/[.,;:!?)]+$/, "");
    if (!isSafeHttpUrl(cleaned)) {
      strippedUrls.push(raw);
      text = text.split(raw).join("[source omitted]");
      continue;
    }
    const norm = normalizeUrl(cleaned);
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

/** Remove provider inline citation markers from assistant-visible prose. */
export function stripInlineCitationMarkers(text: string): string {
  if (!text?.trim()) return text ?? "";
  let out = text;
  out = out.replace(/(?:\[\d+\]){2,}(?=\s|[.,;:!?)]|$)/g, "");
  out = out.replace(/\[\d+\](?=[.,;:!?](?:\s|$))/g, "");
  out = out.replace(/\[\d+\]\s*$/g, "");
  out = out.replace(/\[(?:src_|ev_|source_)[\w-]+\]/gi, "");
  out = out.replace(/\s+([.,;:!?])/g, "$1");
  out = out.replace(/  +/g, " ");
  return out.trim();
}

/** Sanitize assistant prose: URLs + inline citation markers. */
export function normalizeAssistantProse(
  text: string,
  sources?: CitationSource[],
): string {
  let out = text ?? "";
  if (sources?.length) {
    out = validateCitations({ answer: out, sources }).text;
  }
  return stripInlineCitationMarkers(out);
}
