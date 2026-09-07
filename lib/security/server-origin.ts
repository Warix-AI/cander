/**
 * Resolves a safe application origin for server-generated return links.
 * Never reflect an arbitrary Host or Origin header in production.
 */

function originFor(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalhost(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function trustedApplicationOrigin(input: {
  requestUrl: string;
  configuredUrls?: Array<string | null | undefined>;
  production?: boolean;
}): string | null {
  const requestOrigin = originFor(input.requestUrl);
  if (!requestOrigin) return null;

  const configured = new Set(
    (input.configuredUrls ?? [])
      .map(originFor)
      .filter((value): value is string => Boolean(value)),
  );
  if (configured.size) {
    return configured.has(requestOrigin) ? requestOrigin : null;
  }

  if (!input.production || isLocalhost(requestOrigin)) return requestOrigin;
  return null;
}

export function trustedRequestOrigin(request: Request): string | null {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  return trustedApplicationOrigin({
    requestUrl: request.url,
    configuredUrls: [
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXT_PUBLIC_SITE_URL,
      vercelUrl ? `https://${vercelUrl}` : null,
    ],
    production: process.env.NODE_ENV === "production",
  });
}
