/**
 * Signed, short-lived preview session tokens for the draft host
 * (draft--{sub}.cander.app). Cander's Supabase auth cookie is host-only on
 * the app origin, so the iframe on the draft host authenticates with its own
 * cookie minted from this token. Server-only.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const PREVIEW_SESSION_COOKIE = "cander_preview";
export const PREVIEW_SESSION_PATH = "/__cander/session";
export const PREVIEW_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type PreviewTokenClaims = {
  uid: string;
  pid: string;
  ws: string;
  exp: number;
};

function secret(): string {
  const s =
    process.env.CANDER_PREVIEW_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  if (!s) throw new Error("Preview token secret is not configured.");
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function mintPreviewToken(claims: Omit<PreviewTokenClaims, "exp"> & { exp?: number }): string {
  const full: PreviewTokenClaims = {
    ...claims,
    exp: claims.exp ?? Date.now() + PREVIEW_SESSION_TTL_MS,
  };
  const payload = b64url(JSON.stringify(full));
  return `${payload}.${sign(payload)}`;
}

export function verifyPreviewToken(token: string | null | undefined): PreviewTokenClaims | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PreviewTokenClaims;
    if (!claims.uid || !claims.pid || !claims.ws || typeof claims.exp !== "number") return null;
    if (claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}

/** Handshake URL the iframe loads first; it sets the cookie and redirects. */
export function previewSessionHandshakeUrl(opts: {
  draftOrigin: string;
  token: string;
  next?: string;
}): string {
  const u = new URL(PREVIEW_SESSION_PATH, opts.draftOrigin);
  u.searchParams.set("t", opts.token);
  u.searchParams.set("next", opts.next && opts.next.startsWith("/") ? opts.next : "/");
  return u.toString();
}
