/**
 * Pure request IP / geo helpers (no server client imports).
 */

export function cleanHeader(value: string | null | undefined, max = 500) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function parseIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let first = raw.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    if (end > 0) first = first.slice(1, end);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(first)) {
    first = first.replace(/:\d+$/, "");
  }
  if (first.length > 64 || /[^0-9a-fA-F:.]/.test(first)) return null;
  return first;
}

export function clientIpFromHeaders(headers: Headers): string | null {
  return (
    parseIp(headers.get("cf-connecting-ip")) ||
    parseIp(headers.get("x-real-ip")) ||
    parseIp(headers.get("x-forwarded-for")) ||
    parseIp(headers.get("x-vercel-forwarded-for"))
  );
}

export function geoFromHeaders(headers: Headers): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  return {
    country:
      cleanHeader(headers.get("cf-ipcountry"), 8) ||
      cleanHeader(headers.get("x-vercel-ip-country"), 8),
    region:
      cleanHeader(headers.get("x-vercel-ip-country-region"), 80) ||
      cleanHeader(headers.get("cf-region"), 80),
    city:
      cleanHeader(headers.get("x-vercel-ip-city"), 80) ||
      cleanHeader(headers.get("cf-ipcity"), 80),
  };
}
