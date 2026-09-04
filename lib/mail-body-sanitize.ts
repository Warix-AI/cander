import { stripMailSpacerNoise } from "@/lib/mail-html";

/**
 * Clean Gmail plain/HTML text for reading pane display.
 * Strips CSS rules, style blocks, and other MIME noise that often leaks into bodyText.
 */

const CSS_RULE_RE =
  /(?:^|\n)\s*(?:body|table|td|th|div|p|a|span|img|html|\*)[^{;\n]*\{[^}]*\}/gi;
const CSS_BLOCK_RE = /\/\*[\s\S]*?\*\//g;
const STYLE_ATTR_NOISE_RE =
  /(?:font-family|!important|mso-[a-z-]+)\s*:[^;\n}]+;?/gi;

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

export function sanitizeMailText(raw: string): string {
  let text = stripMailSpacerNoise(
    raw
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(CSS_BLOCK_RE, " ")
      .replace(CSS_RULE_RE, "\n")
      .replace(STYLE_ATTR_NOISE_RE, " ")
      .replace(/&#(\d+);/g, (_, n) => {
        const code = Number(n);
        if (!Number.isFinite(code) || code <= 0) return "";
        try {
          return String.fromCodePoint(code);
        } catch {
          return "";
        }
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
        const code = Number.parseInt(h, 16);
        if (!Number.isFinite(code) || code <= 0) return "";
        try {
          return String.fromCodePoint(code);
        } catch {
          return "";
        }
      }),
  );

  // Drop lines that are almost entirely CSS / MIME chrome.
  text = text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^[^{]*\{[^}]*\}$/.test(trimmed)) return false;
      if (/^(body|table|td|th)\s*,/i.test(trimmed)) return false;
      if (/!important/i.test(trimmed) && trimmed.includes("{")) return false;
      if (/^Content-Type:/i.test(trimmed)) return false;
      if (/^Content-Transfer-Encoding:/i.test(trimmed)) return false;
      return true;
    })
    .join("\n");

  return stripMailSpacerNoise(
    text
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

export function resolveMailPlainText(input: {
  bodyText?: string | null;
  bodyHtml?: string | null;
  snippet?: string | null;
}): string {
  const fromText = input.bodyText?.trim()
    ? sanitizeMailText(input.bodyText)
    : "";
  // Prefer HTML-derived plain when the text part is spacer junk / empty.
  const spacerHits = (input.bodyText ?? "").match(
    /&#847;|&#x0*34[fF];|\u034F/g,
  );
  const textIsJunk = (spacerHits?.length ?? 0) > 20;
  if (fromText && !textIsJunk) return fromText;
  const fromHtml = input.bodyHtml?.trim()
    ? sanitizeMailText(htmlToPlainText(input.bodyHtml))
    : "";
  if (fromHtml) return fromHtml;
  if (fromText) return fromText;
  return sanitizeMailText(input.snippet?.trim() || "");
}

export function resolveMailHtml(input: {
  bodyHtml?: string | null;
}): string | null {
  const html = input.bodyHtml?.trim();
  return html || null;
}
