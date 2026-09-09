/**
 * TEMPORARY production diagnostic — remove after Option B permission verify.
 *
 * POST /api/internal/vercel-permission-probe
 * Auth: Authorization: Bearer $CANDER_VERCEL_DIAGNOSTIC_SECRET
 *       (or x-cander-diagnostic-secret header)
 *
 * Uses production VERCEL_TOKEN / VERCEL_TEAM_ID via vercelFetch.
 * Never returns or logs the token.
 */

import { NextResponse } from "next/server";
import { runProductionVercelPermissionProbe } from "@/lib/build/vercel/production-permission-probe";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorize(request: Request): boolean {
  const secret = process.env.CANDER_VERCEL_DIAGNOSTIC_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = request.headers.get("x-cander-diagnostic-secret")?.trim() || "";
  return bearer === secret || header === secret;
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let optionBRepo: string | undefined;
  let optionBRepoId: number | undefined;
  let optionBSha: string | undefined;
  let optionBRef: string | undefined;
  try {
    const body = (await request.json()) as {
      optionBRepo?: string;
      optionBRepoId?: number;
      optionBSha?: string;
      optionBRef?: string;
    };
    optionBRepo = body.optionBRepo;
    optionBRepoId = body.optionBRepoId;
    optionBSha = body.optionBSha;
    optionBRef = body.optionBRef;
  } catch {
    /* empty body ok */
  }

  try {
    const result = await runProductionVercelPermissionProbe({
      optionBRepo,
      optionBRepoId,
      optionBSha,
      optionBRef,
    });

    const status =
      result.stoppedReason === "create_forbidden"
        ? 403
        : result.stoppedReason === "misconfigured"
          ? 503
          : result.ok
            ? 200
            : 502;

    return NextResponse.json(
      {
        ok: result.ok,
        stoppedReason: result.stoppedReason,
        teamIdConfigured: result.teamIdConfigured,
        platformProjectIdConfigured: result.platformProjectIdConfigured,
        tokenConfigured: result.tokenConfigured,
        disposableProjectId: result.disposableProjectId,
        optionBProjectId: result.optionBProjectId,
        steps: result.steps,
      },
      { status },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "probe failed";
    console.error("[cander:vercel-probe] error", {
      message: message.slice(0, 400),
    });
    return NextResponse.json(
      { ok: false, stoppedReason: "error", error: message.slice(0, 400) },
      { status: 500 },
    );
  }
}
