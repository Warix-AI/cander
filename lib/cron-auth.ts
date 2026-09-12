/**
 * Shared auth for Vercel Cron /api/cron/* routes.
 *
 * When CRON_SECRET is set, Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 * When it is not set, production used to reject every cron (401) — which left
 * Gmail sync stuck. In that case we accept Vercel Cron's own UA / schedule header.
 */

export function authorizeCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() || "";

  if (secret) {
    return bearer === secret || headerSecret === secret;
  }

  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  const schedule = request.headers.get("x-vercel-cron-schedule");
  const isVercelCron = ua.includes("vercel-cron") || Boolean(schedule?.trim());
  if (isVercelCron) return true;

  // Local / preview without CRON_SECRET.
  return process.env.NODE_ENV !== "production";
}
