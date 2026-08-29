/**
 * SSRF-safe HTTP(S) page fetch for evidence reading.
 */

export type FetchedPage = {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  ok: boolean;
  error?: string;
};

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0") {
    return true;
  }
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv4 private / link-local / metadata
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./.test(h)) return true; // CGNAT-ish
  if (h === "metadata.google.internal") return true;
  return false;
}

function validateUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (isPrivateHostname(u.hostname)) return null;
  return u;
}

function stripHtml(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  return { title, text: body.slice(0, 12_000) };
}

const MAX_REDIRECTS = 3;
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;

export async function fetchReadablePage(
  rawUrl: string,
): Promise<FetchedPage> {
  const start = validateUrl(rawUrl);
  if (!start) {
    return {
      url: rawUrl,
      finalUrl: rawUrl,
      title: "",
      text: "",
      ok: false,
      error: "blocked_or_invalid_url",
    };
  }

  let current = start;
  try {
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "User-Agent": "CanderBot/1.0 (+https://cander.app)",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) {
          return {
            url: rawUrl,
            finalUrl: current.toString(),
            title: "",
            text: "",
            ok: false,
            error: "redirect_missing",
          };
        }
        const next = validateUrl(new URL(loc, current).toString());
        if (!next) {
          return {
            url: rawUrl,
            finalUrl: current.toString(),
            title: "",
            text: "",
            ok: false,
            error: "redirect_blocked",
          };
        }
        current = next;
        continue;
      }

      if (!res.ok) {
        return {
          url: rawUrl,
          finalUrl: current.toString(),
          title: "",
          text: "",
          ok: false,
          error: `http_${res.status}`,
        };
      }

      const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
      if (
        ctype &&
        !ctype.includes("text/") &&
        !ctype.includes("html") &&
        !ctype.includes("json") &&
        !ctype.includes("xml")
      ) {
        return {
          url: rawUrl,
          finalUrl: current.toString(),
          title: "",
          text: "",
          ok: false,
          error: "unsupported_content_type",
        };
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) {
        return {
          url: rawUrl,
          finalUrl: current.toString(),
          title: "",
          text: "",
          ok: false,
          error: "response_too_large",
        };
      }
      const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      if (ctype.includes("json") || ctype.includes("text/plain")) {
        return {
          url: rawUrl,
          finalUrl: current.toString(),
          title: current.hostname,
          text: raw.slice(0, 12_000),
          ok: true,
        };
      }
      const { title, text } = stripHtml(raw);
      return {
        url: rawUrl,
        finalUrl: current.toString(),
        title: title || current.hostname,
        text,
        ok: Boolean(text.trim()),
      };
    }
    return {
      url: rawUrl,
      finalUrl: current.toString(),
      title: "",
      text: "",
      ok: false,
      error: "too_many_redirects",
    };
  } catch (err) {
    return {
      url: rawUrl,
      finalUrl: current.toString(),
      title: "",
      text: "",
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 120) : "fetch_failed",
    };
  }
}
