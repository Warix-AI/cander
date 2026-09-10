/**
 * Per-job bearer tokens for the sandbox builder → Cander callbacks
 * (events, LLM proxy, 21st proxy). HMAC-SHA256, expires with the job.
 * Server-only.
 */

import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export type BuildJobTokenClaims = {
  jobId: string;
  projectId: string;
  workspaceId: string;
  /** Unix seconds. */
  exp: number;
};

function secret(): Buffer {
  const explicit = process.env.CANDER_BUILD_JOB_SECRET?.trim();
  if (explicit) return Buffer.from(explicit, "utf8");
  // Derive from the service-role key so deployments work without a new env
  // var; the derived value never leaves the server.
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) throw new Error("CANDER_BUILD_JOB_SECRET (or service key) missing");
  return createHash("sha256").update(`cander-build-job:${base}`).digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function signBuildJobToken(claims: BuildJobTokenClaims): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8");
  const mac = createHmac("sha256", secret()).update(payload).digest();
  return `${b64url(payload)}.${b64url(mac)}`;
}

export function verifyBuildJobToken(
  token: string | null | undefined,
): BuildJobTokenClaims | null {
  if (!token) return null;
  const [p, m] = token.split(".");
  if (!p || !m) return null;
  let payload: Buffer;
  let mac: Buffer;
  try {
    payload = Buffer.from(p, "base64url");
    mac = Buffer.from(m, "base64url");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret()).update(payload).digest();
  if (expected.length !== mac.length || !timingSafeEqual(expected, mac)) {
    return null;
  }
  let claims: BuildJobTokenClaims;
  try {
    claims = JSON.parse(payload.toString("utf8")) as BuildJobTokenClaims;
  } catch {
    return null;
  }
  if (
    !claims ||
    typeof claims.jobId !== "string" ||
    typeof claims.projectId !== "string" ||
    typeof claims.workspaceId !== "string" ||
    typeof claims.exp !== "number"
  ) {
    return null;
  }
  if (claims.exp * 1000 < Date.now()) return null;
  return claims;
}

/** Read `Authorization: Bearer <job token>` and verify it targets `jobId`. */
export function requireBuildJobToken(
  request: Request,
  jobId: string,
): BuildJobTokenClaims | null {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : null;
  const claims = verifyBuildJobToken(token);
  if (!claims || claims.jobId !== jobId) return null;
  return claims;
}
