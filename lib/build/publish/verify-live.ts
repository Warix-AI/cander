/**
 * Post-publish verification: fetch the live site and check the basics a
 * launch-ready marketing site must have. Pure network + HTML parsing; no DB.
 * Server-only (runs after publishProject). Best-effort — never throws.
 */

export type LiveCheck = {
  id:
    | "home"
    | "title"
    | "description"
    | "canonical"
    | "og"
    | "robots"
    | "sitemap"
    | "not_found"
    | "https";
  label: string;
  ok: boolean;
  detail?: string;
};

export type LiveVerification = {
  url: string;
  checkedAt: string;
  ok: boolean;
  checks: LiveCheck[];
};

async function get(url: string, timeoutMs = 12_000) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "text/html,application/xml,text/plain,*/*",
        "User-Agent": "cander-publish-verify/1.0",
      },
      cache: "no-store",
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, text, finalUrl: res.url || url };
  } catch (err) {
    return { status: 0, text: "", finalUrl: url, error: err instanceof Error ? err.message : String(err) };
  }
}

function meta(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key.replace(/[:.]/g, "\\$&")}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key.replace(/[:.]/g, "\\$&")}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2] ?? "").trim() || null : null;
}

export async function verifyLiveSite(rawUrl: string): Promise<LiveVerification> {
  const base = (() => {
    try {
      const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
      return u.origin;
    } catch {
      return null;
    }
  })();
  const checkedAt = new Date().toISOString();
  if (!base) {
    return {
      url: rawUrl,
      checkedAt,
      ok: false,
      checks: [{ id: "home", label: "Home page loads", ok: false, detail: "Invalid URL" }],
    };
  }

  const [home, robots, sitemap, missing] = await Promise.all([
    get(`${base}/`, 20_000),
    get(`${base}/robots.txt`),
    get(`${base}/sitemap.xml`),
    get(`${base}/cander-404-probe-${Date.now().toString(36)}`),
  ]);

  const html = home.text || "";
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
  const description = meta(html, "name", "description");
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? null;
  const ogTitle = meta(html, "property", "og:title");
  const ogImage = meta(html, "property", "og:image");

  const checks: LiveCheck[] = [
    {
      id: "home",
      label: "Home page loads",
      ok: home.status >= 200 && home.status < 400 && html.length > 200,
      detail: home.status ? `HTTP ${home.status}` : home.error || "no response",
    },
    {
      id: "https",
      label: "Served over HTTPS",
      ok: home.finalUrl.startsWith("https://"),
      detail: home.finalUrl,
    },
    {
      id: "title",
      label: "Page title",
      ok: title.length >= 5 && !/^create next app$|^new site$|^untitled/i.test(title),
      detail: title || "missing",
    },
    {
      id: "description",
      label: "Meta description",
      ok: Boolean(description && description.length >= 40),
      detail: description ? `${description.length} chars` : "missing",
    },
    {
      id: "canonical",
      label: "Canonical URL",
      ok: Boolean(canonical && canonical.startsWith("http")),
      detail: canonical || "missing",
    },
    {
      id: "og",
      label: "Open Graph tags",
      ok: Boolean(ogTitle && ogImage),
      detail: ogTitle ? (ogImage ? "title + image" : "no og:image") : "missing",
    },
    {
      id: "robots",
      label: "robots.txt",
      ok: robots.status === 200 && !/disallow:\s*\/\s*$/im.test(robots.text),
      detail:
        robots.status === 200
          ? /disallow:\s*\/\s*$/im.test(robots.text)
            ? "blocks all crawlers"
            : "ok"
          : `HTTP ${robots.status}`,
    },
    {
      id: "sitemap",
      label: "sitemap.xml",
      ok: sitemap.status === 200 && /<urlset|<sitemapindex/i.test(sitemap.text),
      detail:
        sitemap.status === 200
          ? `${(sitemap.text.match(/<loc>/gi) || []).length} URL(s)`
          : `HTTP ${sitemap.status}`,
    },
    {
      id: "not_found",
      label: "Unknown routes return 404",
      ok: missing.status === 404,
      detail: missing.status ? `HTTP ${missing.status}` : "no response",
    },
  ];

  return { url: base, checkedAt, ok: checks.every((c) => c.ok), checks };
}

export function formatLiveVerification(v: LiveVerification): string {
  const lines = v.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.label}${c.ok ? "" : c.detail ? ` — ${c.detail}` : ""}`);
  return lines.join("\n");
}
