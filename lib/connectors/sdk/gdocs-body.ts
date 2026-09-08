/**
 * Google Docs body extraction — prefer structured markdown / HTML page form
 * over smashed plain text from Composio exports.
 */

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function paragraphText(paragraph: Record<string, unknown>): string {
  const elements = paragraph.elements;
  if (!Array.isArray(elements)) return "";
  const parts: string[] = [];
  for (const el of elements) {
    if (!el || typeof el !== "object") continue;
    const textRun = (el as Record<string, unknown>).textRun;
    if (!textRun || typeof textRun !== "object") continue;
    const text = pickString((textRun as Record<string, unknown>).content);
    if (text) parts.push(text);
  }
  return parts.join("").replace(/\r/g, "").replace(/\u000b/g, "\n").trimEnd();
}

function tableMarkdown(table: Record<string, unknown>): string {
  const rows = Array.isArray(table.tableRows) ? table.tableRows : [];
  const grid: string[][] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const cells = Array.isArray((row as Record<string, unknown>).tableCells)
      ? ((row as Record<string, unknown>).tableCells as unknown[])
      : [];
    const line: string[] = [];
    for (const cell of cells) {
      if (!cell || typeof cell !== "object") {
        line.push("");
        continue;
      }
      const content = (cell as Record<string, unknown>).content;
      const bits: string[] = [];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const paragraph = (block as Record<string, unknown>).paragraph;
          if (paragraph && typeof paragraph === "object") {
            const t = paragraphText(paragraph as Record<string, unknown>).trim();
            if (t) bits.push(t);
          }
        }
      }
      line.push(bits.join(" ").replace(/\|/g, "\\|") || " ");
    }
    if (line.length) grid.push(line);
  }
  if (!grid.length) return "";
  const width = Math.max(...grid.map((r) => r.length));
  const normalized = grid.map((r) => {
    const next = [...r];
    while (next.length < width) next.push(" ");
    return next;
  });
  const header = normalized[0]!;
  const sep = header.map(() => "---");
  const body = normalized.slice(1);
  return [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

/** Build readable markdown from Google Docs API structural body. */
export function structuredDocsToMarkdown(
  payload: Record<string, unknown>,
): string | null {
  const body =
    payload.body && typeof payload.body === "object"
      ? (payload.body as Record<string, unknown>)
      : payload.data &&
          typeof payload.data === "object" &&
          (payload.data as Record<string, unknown>).body &&
          typeof (payload.data as Record<string, unknown>).body === "object"
        ? ((payload.data as Record<string, unknown>).body as Record<
            string,
            unknown
          >)
        : null;
  if (!body) return null;
  const content = body.content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const row = block as Record<string, unknown>;

    if (row.paragraph && typeof row.paragraph === "object") {
      const paragraph = row.paragraph as Record<string, unknown>;
      const text = paragraphText(paragraph);
      if (!text.trim()) {
        parts.push("");
        continue;
      }
      const style =
        paragraph.paragraphStyle &&
        typeof paragraph.paragraphStyle === "object"
          ? pickString(
              (paragraph.paragraphStyle as Record<string, unknown>)
                .namedStyleType,
            )
          : undefined;
      const hasBullet = Boolean(paragraph.bullet);
      if (style === "TITLE") parts.push(`# ${text.trim()}`);
      else if (style === "SUBTITLE") parts.push(`*${text.trim()}*`);
      else if (style === "HEADING_1") parts.push(`## ${text.trim()}`);
      else if (style === "HEADING_2") parts.push(`### ${text.trim()}`);
      else if (style === "HEADING_3") parts.push(`#### ${text.trim()}`);
      else if (style === "HEADING_4") parts.push(`##### ${text.trim()}`);
      else if (hasBullet) parts.push(`- ${text.trim()}`);
      else parts.push(text.trim());
      continue;
    }

    if (row.table && typeof row.table === "object") {
      const md = tableMarkdown(row.table as Record<string, unknown>);
      if (md) parts.push(md);
    }
  }

  const joined = parts
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return joined || null;
}

/** Lightweight Google Docs HTML → markdown for page rendering. */
export function docsHtmlToMarkdown(html: string): string {
  let next = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  next = next
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n")
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n\n##### $1\n\n")
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n\n###### $1\n\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return next;
}

export function normalizeDocBodyText(text: string): string {
  let next = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!next.includes("\n") && next.includes("\\n")) {
    next = next.replace(/\\n/g, "\n");
  }
  // Soft-split common smashed section labels when the export lost newlines.
  if ((next.match(/\n/g) ?? []).length < 3 && next.length > 180) {
    next = next
      .replace(
        /(Challenge|Solution|Impact|Results?|Overview|Summary|Background|Outcome):/gi,
        "\n\n**$1:** ",
      )
      .replace(
        /(Finance & Law|Real Estate Agents|Agriculture|Healthcare|Education|Retail|Manufacturing)\b/g,
        "\n\n## $1\n",
      )
      .replace(/([a-z])([A-Z][a-z])/g, "$1\n\n$2")
      .trim();
  }
  return next.trim();
}
